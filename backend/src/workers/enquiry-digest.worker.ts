// Worker — drains the enquiry digest queue and mails each business its waiting
// leads. Run with: npm run job:enquiry-digest
//
// V1 ran `send-enquiry-digest` as a Supabase edge function that nothing ever
// scheduled (no `cron.schedule` for it exists anywhere in the V1 repo), so in
// practice it only fired on the immediate single-agent trigger. V3 rides LavinMQ
// like every other worker: a message on `enquiry_digest` is a tick, not a
// payload, and anything can publish one — the distributor after a fan-out, or a
// platform scheduler. No cron container.

import "dotenv/config";
import { queueService } from "../shared/queue/queueService.js";
import { mailerService } from "../shared/mail/mailerService.js";
import { createChildLogger } from "../shared/logger.js";
import { DIGEST_QUEUE } from "../modules/enquiries/consts.js";
import { runDigest } from "../modules/enquiries/services/digest.service.js";

const logger = createChildLogger("enquiry-digest-worker");

await queueService.consume(DIGEST_QUEUE, async () => {
  // A re-delivered tick is harmless: runDigest claims rows with a single
  // conditional UPDATE ... RETURNING, so the second delivery claims nothing.
  const result = await runDigest((email) => mailerService.sendMail(email));
  logger.info("digest tick handled", result);
});

logger.info(`Enquiry digest worker started — consuming '${DIGEST_QUEUE}'`);
