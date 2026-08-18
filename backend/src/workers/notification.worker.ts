// Worker — consumes "notifications" and fans one message out to its recipients.
//
// Run with: npm run job:notifications
//
// The whole body is fanout(), which lives in the notifications module so it can
// be tested by calling it. This file is only the wiring: consume, hand the JSON
// over, let queueService ack on return and nack on throw.
//
// A nacked message is redelivered; that is safe because fanout() is idempotent
// on (platform_user_id, dedupe_key) and (notification_id, channel) — see the
// header of services/fanout.service.ts.

import "dotenv/config";
import { queueService } from "../shared/queue/queueService.js";
import { createChildLogger } from "../shared/logger.js";
import { NOTIFICATION_QUEUE } from "../modules/notifications/consts.js";
import { fanout } from "../modules/notifications/services/fanout.service.js";

const logger = createChildLogger("notification-worker");

await queueService.consume(NOTIFICATION_QUEUE, async (msg) => {
  const payload = JSON.parse(msg!.content.toString());
  const result = await fanout(payload);
  logger.info("Fan-out complete", {
    dedupe_key: payload?.dedupe_key,
    created: result.notifications_created,
    already_present: result.notifications_existing,
    dispatched: result.dispatched,
    skipped: result.skipped,
  });
});

logger.info(`Notification worker started — consuming '${NOTIFICATION_QUEUE}'`);
