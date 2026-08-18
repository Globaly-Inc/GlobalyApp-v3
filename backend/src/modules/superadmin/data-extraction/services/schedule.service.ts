// The periodic trigger behind the extraction schedule.
//
// §3.4 records the gap as "extraction-schedule.worker.ts is one-shot by design and
// nothing invokes it — no cron container in compose. Heartbeat/stall fields exist;
// only the periodic trigger is absent."
//
// Half of that is stale: docker-compose.yml has always had an
// `extraction-schedule-worker` service. But it runs the one-shot, which exits
// immediately, and the service has no restart policy — so the container ran once and
// died. The scheduler was fine; the trigger really was missing. This module is that
// trigger, plus V1's second pg_cron job (reap-stalled-jobs), which V3 had columns and
// an index for but no reaper.
//
// ── ANTI-STAMPEDE: pg_try_advisory_xact_lock ────────────────────────────────
//
// Overlapping runs are prevented by a transaction-scoped Postgres advisory lock, not
// by a claim column on the row. Reasons, in the order they mattered:
//
//   * A crashed run cannot wedge the schedule. Postgres releases the lock when the
//     transaction ends for ANY reason — commit, rollback, or the backend dying with
//     the container. A `locked_until` column would need a timeout guess and a reaper
//     of its own, and picking that timeout is exactly the kind of decision that gets
//     it wrong: too short and two runs overlap anyway, too long and a crash freezes
//     the schedule for as long as it takes someone to notice.
//   * It covers every replica. The lock lives in the shared database, so a second
//     container, a hand-run `npm run job:extraction-schedule`, and an operator's
//     manual queue trigger all contend on the same lock. An in-process mutex would
//     only have covered one of those.
//   * No migration and no new table. The lock is a runtime primitive.
//
// try_ rather than the blocking form: a tick that cannot get the lock means another
// tick is already doing the work, so the right answer is to skip this one and come
// back on the next interval — never to queue up behind it.
//
// ponytail: one global lock, so ticks are serial. That is correct at any plausible
// schedule count (the query is LIMIT 25 and the work is a queue publish). If a tick
// ever grows slow enough to miss its own interval, move to
// pg_try_advisory_xact_lock(SCHEDULE_TICK_LOCK, hashtext(schedule_id)) for per-row locks.

import { masterKnex } from "../../../../core/db/master-pool.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { queueService } from "../../../../shared/queue/queueService.js";
import { EXTRACTION_QUEUES } from "../shared/queues.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";

const logger = createChildLogger("extraction-schedule");

/**
 * Arbitrary but fixed. Advisory lock keys share one namespace per database, so this is
 * registered here as the extraction scheduler's: 0x6738 = "g8" in hex, wave G8.
 */
export const SCHEDULE_TICK_LOCK = 0x6738;

/** How many due schedules one tick will take. Matches the pre-existing behaviour. */
const BATCH = 25;

/**
 * A job whose heartbeat is older than this is presumed dead and marked `stalled` so an
 * operator (or a resume) can pick it up. V1's pg_cron reaper runs every minute against
 * the same idea; 15 minutes is comfortably longer than the slowest single page
 * extraction, so a slow job is never reaped out from under itself.
 */
const STALL_AFTER_MINUTES = 15;

export type Cadence = "daily" | "weekly" | "monthly";

interface DueSchedule {
  id: string;
  job_id: string;
  cadence: Cadence;
}

// ponytail: simple additive cadence, same as V2
export function addCadence(from: Date, cadence: Cadence): Date {
  const d = new Date(from);
  if (cadence === "daily") d.setUTCDate(d.getUTCDate() + 1);
  else if (cadence === "weekly") d.setUTCDate(d.getUTCDate() + 7);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

export interface ScheduleResult {
  schedule_id: string;
  job_id: string;
  ok: boolean;
  error?: string;
}

export interface TickReport {
  /** False when another tick already held the lock — this one did nothing. */
  ran: boolean;
  schedules: ScheduleResult[];
  /** Jobs whose heartbeat went stale and were marked `stalled`. */
  reaped: number;
}

export const SKIPPED_TICK: TickReport = { ran: false, schedules: [], reaped: 0 };

/**
 * One scheduler tick, guarded against overlap. Safe to call from a ticker, from the
 * SCHEDULE queue, from a one-shot cron, and from all three at once.
 */
export async function runScheduleTick(): Promise<TickReport> {
  // The transaction exists only to scope the lock to a single connection and to
  // release it no matter how this ends. The work inside deliberately uses masterKnex,
  // not this trx: a per-schedule failure must not roll back the schedules that
  // already advanced, or the next tick would re-publish work that has been queued.
  return masterKnex.transaction(async (trx) => {
    const { rows } = await trx.raw("SELECT pg_try_advisory_xact_lock(?) AS locked", [SCHEDULE_TICK_LOCK]);
    if (!rows[0]?.locked) {
      logger.info("Another schedule tick holds the lock — skipping this one");
      return SKIPPED_TICK;
    }

    const schedules = await processDueSchedules();
    const reaped = await reapStalledJobs();
    return { ran: true, schedules, reaped };
  });
}

async function processDueSchedules(): Promise<ScheduleResult[]> {
  const due = (await masterKnex(`${S}.agent_extraction_schedule`)
    .where({ enabled: true })
    .where("next_run_at", "<=", masterKnex.fn.now())
    .select("id", "job_id", "cadence")
    .orderBy("next_run_at", "asc")
    .limit(BATCH)) as DueSchedule[];

  if (due.length) logger.info(`${due.length} due schedules`);

  const results: ScheduleResult[] = [];

  for (const schedule of due) {
    const startedAt = new Date();
    try {
      await queueService.publish(EXTRACTION_QUEUES.STEPS, { jobId: schedule.job_id, step: "agents" });
      await advance(schedule, startedAt, { last_status: "success", last_error: null });
      results.push({ schedule_id: schedule.id, job_id: schedule.job_id, ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("Schedule failed", { schedule_id: schedule.id, error: message });
      // next_run_at advances even on failure: a schedule that cannot publish must not
      // be retried on every tick for ever. last_error says why it was skipped.
      await advance(schedule, startedAt, {
        last_status: "failed_exception",
        last_error: message.slice(0, 500),
      }).catch((updateErr) =>
        logger.error("Failed to record schedule status", { schedule_id: schedule.id, error: updateErr }),
      );
      results.push({ schedule_id: schedule.id, job_id: schedule.job_id, ok: false, error: message });
    }
  }

  return results;
}

async function advance(schedule: DueSchedule, startedAt: Date, status: Record<string, unknown>) {
  await masterKnex(`${S}.agent_extraction_schedule`).where({ id: schedule.id }).update({
    ...status,
    last_run_at: startedAt,
    next_run_at: addCadence(startedAt, schedule.cadence),
    updated_at: masterKnex.fn.now(),
  });
}

/**
 * V1's reap-stalled-jobs. A worker that died mid-job leaves the row in `processing`
 * for ever, invisible to both the queue and the operator; this marks it `stalled`,
 * which the console already renders and `POST /jobs/:id/resume` already accepts.
 *
 * Only `processing` is reaped. `pending` has no heartbeat yet by definition, and
 * `stalled` is already where this would put it.
 */
export async function reapStalledJobs(): Promise<number> {
  return masterKnex(`${S}.extraction_jobs`)
    .where({ status: "processing" })
    .whereNotNull("processing_heartbeat_at")
    .where("processing_heartbeat_at", "<", masterKnex.raw(`now() - interval '${STALL_AFTER_MINUTES} minutes'`))
    .update({
      status: "stalled",
      error_message: masterKnex.raw("coalesce(error_message, ?)", [
        `No worker heartbeat for over ${STALL_AFTER_MINUTES} minutes`,
      ]),
      updated_at: masterKnex.fn.now(),
    });
}
