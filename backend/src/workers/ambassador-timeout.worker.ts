// Worker — reroutes ambassador inquiries whose 5-minute accept window closed.
// Run with: npm run job:ambassador-timeout
//
// V1 shipped `process-ambassador-timeout` as a Supabase edge function that
// nothing scheduled. V3 rides LavinMQ like every other worker here: a message on
// `ambassador_timeout` is a tick, not a payload, so anything (a platform
// scheduler, an operator) can publish one. No cron container.

import "dotenv/config";
import { queueService } from "../shared/queue/queueService.js";
import { createChildLogger } from "../shared/logger.js";
import { TIMEOUT_QUEUE } from "../modules/ambassadors/consts.js";
import { processTimeouts } from "../modules/ambassadors/services/timeout.service.js";

const logger = createChildLogger("ambassador-timeout-worker");

await queueService.consume(TIMEOUT_QUEUE, async () => {
  // A re-delivered tick is harmless: each reroute is a conditional UPDATE that
  // re-asserts status='matched', so the second delivery claims nothing.
  const result = await processTimeouts();
  logger.info("timeout tick handled", result);
});

logger.info(`Ambassador timeout worker started — consuming '${TIMEOUT_QUEUE}'`);
