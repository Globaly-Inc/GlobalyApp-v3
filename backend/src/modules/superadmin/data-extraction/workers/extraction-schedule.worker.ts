// Worker — the periodic trigger for agent_extraction_schedule.
//
// All three modes call the same guarded tick (services/schedule.service.ts), so they
// can be running at once without stampeding: a Postgres advisory lock lets exactly one
// tick through and the others skip. See that file for why a lock rather than a claim
// column.
//
//   npm run job:extraction-schedule                 one-shot, then exit  (external cron)
//   npm run job:extraction-schedule -- --every=60   tick every 60s       (compose default)
//   npm run job:extraction-schedule -- --consume    tick on SCHEDULE queue (manual trigger)
//
// --every is what closes §3.4's gap. The container was always in compose; it ran the
// one-shot, exited, and — with no restart policy — never ran again.

import "dotenv/config";
import { queueService } from "../../../../shared/queue/queueService.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { masterKnex } from "../../../../core/db/master-pool.js";
import { EXTRACTION_QUEUES } from "../shared/queues.js";
import { runScheduleTick } from "../services/schedule.service.js";

const logger = createChildLogger("extraction-schedule-worker");

const DEFAULT_INTERVAL_SECONDS = 60;

/** Parsed rather than assumed: a typo'd --every=abc should not silently become a busy loop. */
function intervalSeconds(args: string[]): number | null {
  const flag = args.find((a) => a.startsWith("--every"));
  if (!flag) return null;
  const raw = flag.includes("=") ? flag.split("=")[1] : args[args.indexOf(flag) + 1];
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds < 1) {
    logger.warn(`Unusable --every value ${JSON.stringify(raw)} — using ${DEFAULT_INTERVAL_SECONDS}s`);
    return DEFAULT_INTERVAL_SECONDS;
  }
  return Math.floor(seconds);
}

/** A tick must never take the process down; the next one is a whole interval away. */
async function tickSafely() {
  try {
    const report = await runScheduleTick();
    if (report.ran && (report.schedules.length || report.reaped)) {
      logger.info("Tick complete", { schedules: report.schedules.length, reaped: report.reaped });
    }
  } catch (err) {
    logger.error("Schedule tick failed", { err: err instanceof Error ? err.message : String(err) });
  }
}

const args = process.argv.slice(2);
const every = intervalSeconds(args);

if (args.includes("--consume")) {
  await queueService.consume(EXTRACTION_QUEUES.SCHEDULE, tickSafely);
  logger.info(`Listening on "${EXTRACTION_QUEUES.SCHEDULE}" queue`);
} else if (every !== null) {
  logger.info(`Schedule ticker started — every ${every}s`);
  await tickSafely();

  // Chained timeout, not setInterval: a tick that outruns its interval must not have a
  // second one stacked on top of it. The advisory lock would refuse the overlap anyway,
  // but skipped ticks are noise, not scheduling.
  const loop = async () => {
    await tickSafely();
    timer = setTimeout(loop, every * 1000);
  };
  let timer = setTimeout(loop, every * 1000);

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, () => {
      logger.info(`${signal} — stopping ticker`);
      clearTimeout(timer);
      void masterKnex.destroy().finally(() => process.exit(0));
    });
  }
} else {
  // One-shot: for an external cron (pg_cron, Cloud Scheduler, a k8s CronJob).
  try {
    await tickSafely();
  } finally {
    await masterKnex.destroy();
    process.exit(0);
  }
}
