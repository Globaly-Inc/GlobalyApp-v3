// Batch sweep worker for `enquiry_email_queue` (Phase 8, PRD §17).
//
// Most rows never reach this worker at all — email-queue.service's enqueue()
// sends immediately inline when the recipient was otherwise idle. This sweep
// only exists for the "busy recipient" case: rows that were left `pending`
// because that recipient already had another row in flight, plus any row
// that failed and was requeued (`markFailed` resets to 'pending' below the
// attempt cap — see email-queue.repository.ts).
//
// Cron-triggered, one-shot (mirrors the plan's "cron-style worker entrypoint"
// framing) — run it on a schedule via cron/systemd-timer, not as a long-lived
// process: `npm run job:enquiry-email`.

import "dotenv/config";
import { createChildLogger } from "../../../shared/logger.js";
import { sendQueuedRow } from "../services/email-queue.service.js";
import * as emailQueueRepo from "../repositories/email-queue.repository.js";

const logger = createChildLogger("enquiry-email-worker");
const BATCH_CAP = Number(process.env.ENQUIRY_EMAIL_BATCH_CAP) || 200; // ponytail: flat cap, per-business cap if one recipient starves others

const batch = await emailQueueRepo.claimPendingBatch(BATCH_CAP);
logger.info(`Enquiry email sweep: ${batch.length} pending row(s)`);

for (const row of batch) {
  await sendQueuedRow(row.id);
}

logger.info("Enquiry email sweep complete");
process.exit(0);
