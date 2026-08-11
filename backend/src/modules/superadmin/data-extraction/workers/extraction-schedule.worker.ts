// Worker — processes due agent_extraction_schedule rows.
// Publishes each due schedule to the STEPS queue (step: "agents"),
// then advances next_run_at based on cadence.
//
// Designed as one-shot: process due schedules, then exit.
// Run with: npm run job:extraction-schedule

import "dotenv/config";
import { queueService } from "../../../../shared/queue/queueService.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { masterKnex } from "../../../../core/db/master-pool.js";
import { EXTRACTION_QUEUES } from "../shared/queues.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";

const logger = createChildLogger("extraction-schedule-worker");

type Cadence = "daily" | "weekly" | "monthly";

interface DueSchedule {
  id: string;
  job_id: string;
  cadence: Cadence;
}

// ponytail: simple additive cadence, same as V2
function addCadence(from: Date, cadence: Cadence): Date {
  const d = new Date(from);
  if (cadence === "daily") d.setUTCDate(d.getUTCDate() + 1);
  else if (cadence === "weekly") d.setUTCDate(d.getUTCDate() + 7);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

async function processDueSchedules() {
  const due = await masterKnex(`${S}.agent_extraction_schedule`)
    .where({ enabled: true })
    .where("next_run_at", "<=", masterKnex.fn.now())
    .select("id", "job_id", "cadence")
    .orderBy("next_run_at", "asc")
    .limit(25) as DueSchedule[];

  logger.info(`${due.length} due schedules`);

  const results: Array<{ schedule_id: string; job_id: string; ok: boolean; error?: string }> = [];

  for (const s of due) {
    const startedAt = new Date();
    try {
      await queueService.publish(EXTRACTION_QUEUES.STEPS, {
        jobId: s.job_id,
        step: "agents",
      });

      await masterKnex(`${S}.agent_extraction_schedule`).where({ id: s.id }).update({
        last_run_at: startedAt,
        next_run_at: addCadence(startedAt, s.cadence),
        last_status: "success",
        last_error: null,
        updated_at: masterKnex.fn.now(),
      });

      results.push({ schedule_id: s.id, job_id: s.job_id, ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error("Schedule failed", { schedule_id: s.id, error: msg });

      await masterKnex(`${S}.agent_extraction_schedule`).where({ id: s.id }).update({
        last_run_at: startedAt,
        next_run_at: addCadence(startedAt, s.cadence),
        last_status: "failed_exception",
        last_error: msg.slice(0, 500),
        updated_at: masterKnex.fn.now(),
      }).catch((updateErr) => logger.error("Failed to update schedule status", { schedule_id: s.id, error: updateErr }));

      results.push({ schedule_id: s.id, job_id: s.job_id, ok: false, error: msg });
    }
  }

  logger.info("Schedule run complete", { processed: results.length });
  return results;
}

// One-shot: can also be consumed via SCHEDULE queue for manual triggers
const mode = process.argv[2];

if (mode === "--consume") {
  // Long-running consumer mode (for manual triggers via queue)
  await queueService.consume(EXTRACTION_QUEUES.SCHEDULE, async () => {
    await processDueSchedules();
  });
  logger.info("Listening on SCHEDULE queue");
} else {
  // One-shot cron mode (default)
  try {
    await processDueSchedules();
  } finally {
    await masterKnex.destroy();
    process.exit(0);
  }
}
