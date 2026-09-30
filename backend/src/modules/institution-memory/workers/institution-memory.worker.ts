// Institution memory learning worker.
//
// Consumes LearnJob messages (corrections, thumbs, finished conversations) and runs the
// lifecycle sweep once an hour. Run with: npm run job:institution-memory
// One-off sweep (cron-friendly): npm run job:institution-memory -- --sweep

import "dotenv/config";
import { queueService } from "../../../shared/queue/queueService.js";
import { createChildLogger } from "../../../shared/logger.js";
import { MEMORY_QUEUES } from "../shared/queues.js";
import { LearnJobSchema } from "../schemas/memory.schema.js";
import { runLearnJob, sweepUnlearnedSignals } from "../services/learning.service.js";
import { runSweep } from "../services/memory.service.js";

const logger = createChildLogger("institution-memory-worker");
const SWEEP_MS = Number(process.env.INSTITUTION_MEMORY_SWEEP_MS) || 60 * 60_000;

if (process.argv.includes("--sweep")) {
  logger.info("Sweep", await runSweep());
  logger.info("Learning recovery", await sweepUnlearnedSignals());
  process.exit(0);
}

await queueService.consume(MEMORY_QUEUES.LEARN, async (msg) => {
  const raw = msg?.content.toString() ?? "";
  const parsed = LearnJobSchema.safeParse((() => { try { return JSON.parse(raw); } catch { return null; } })());
  if (!parsed.success) {
    logger.error("Malformed learning job, discarding", { raw: raw.slice(0, 200) });
    return;
  }
  const job = parsed.data;
  try {
    const result = await runLearnJob(job);
    logger.info("Learned", { kind: job.kind, institutionId: job.institution_id, ...result });
  } catch (err) {
    // Logged and acked: a job that throws would be redelivered forever by a nack loop, and a
    // lost learning opportunity is the cheaper failure.
    logger.error("Learning job failed", { job, err: err instanceof Error ? err.message : String(err) });
  }
});

setInterval(() => runSweep().catch((err) => logger.error("Sweep failed", { err: String(err) })), SWEEP_MS);
// Rides the same interval rather than adding a timer: both are "reconcile what the event path
// missed", and a broker outage that loses learning jobs is exactly the kind of thing an hourly
// pass is for. Independently caught — a failed recovery must not stop the lifecycle sweep.
setInterval(
  () => sweepUnlearnedSignals().catch((err) => logger.error("Learning recovery failed", { err: String(err) })),
  SWEEP_MS,
);
logger.info(`Institution memory worker started — consuming "${MEMORY_QUEUES.LEARN}", sweeping every ${SWEEP_MS / 60_000} min`);
