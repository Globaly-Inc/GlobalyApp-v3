// Digest sweep worker for `enquiry_email_queue` (PRD §17).
//
// New-enquiry notices are never sent on the request path any more — enqueue()
// only inserts them. This worker is what actually delivers them: every poll it
// collects each recipient's pending rows whose group has aged past the 5-minute
// window and sends ONE summary listing all of them. It also retries the
// non-batched mails (`enquiry_unlocked`) whose inline send failed.
//
// Long-lived, not one-shot: nothing else in the deployment schedules it, and a
// pending row that no process ever picks up is a lost notification. Runs as the
// `enquiry-email-worker` compose service (`npm run job:enquiry-email`).
// `--once` does a single pass and exits, for cron or a manual drain.

import "dotenv/config";
import { createChildLogger } from "../../../shared/logger.js";
import { sweepDigests } from "../services/email-queue.service.js";

const logger = createChildLogger("enquiry-email-worker");
const POLL_MS = Number(process.env.ENQUIRY_EMAIL_POLL_MS) || 60_000;

// A sweep sends serially behind a ~1.2s throttle, so a backlog of groups can easily
// outrun POLL_MS. Overlapping ticks are not harmless: two passes over the same group
// produce two summaries for one window when the group holds more rows than one digest
// claims. claimGroup's advisory lock is the real guard (it also covers a second
// replica); this flag stops a single process from stacking passes it cannot keep up
// with, and keeps sends serial so the rate limit means something.
let running = false;

// The catch is load-bearing, not defensive noise: an unhandled rejection in a
// setInterval callback takes the process down, and a dead sweeper is silent.
async function tick() {
  if (running) {
    logger.warn("Previous enquiry email sweep still running — skipping this tick");
    return;
  }
  running = true;
  try {
    await sweepDigests();
  } catch (err) {
    logger.error("Enquiry email sweep failed", { error: err });
  } finally {
    running = false;
  }
}

await tick();

if (process.argv.includes("--once")) {
  logger.info("Enquiry email sweep complete (--once)");
  process.exit(0);
}

setInterval(tick, POLL_MS);
logger.info(`Enquiry email worker polling every ${POLL_MS}ms`);
