// Worker — mails each active ambassador program its weekly report.
// Run with: npm run job:ambassador-digest
//
// Behavioural spec: V1 `send-ambassador-digest`. Same tick-not-payload contract
// as the enquiry digest worker next door.

import "dotenv/config";
import { queueService } from "../shared/queue/queueService.js";
import { mailerService } from "../shared/mail/mailerService.js";
import { createChildLogger } from "../shared/logger.js";
import { DIGEST_QUEUE } from "../modules/ambassadors/consts.js";
import { runDigest } from "../modules/ambassadors/services/digest.service.js";

const logger = createChildLogger("ambassador-digest-worker");

await queueService.consume(DIGEST_QUEUE, async () => {
  const result = await runDigest((email) => mailerService.sendMail(email));
  logger.info("ambassador digest tick handled", result);
});

logger.info(`Ambassador digest worker started — consuming '${DIGEST_QUEUE}'`);
