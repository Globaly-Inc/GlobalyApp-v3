// Worker — consumes "enquiry_created" queue, runs the tiered matcher, and
// publishes "enquiry_distributed" for later phases (email queue) to consume.
//
// Run with: npm run job:enquiry-match

import "dotenv/config";
import { queueService } from "../../../shared/queue/queueService.js";
import { createChildLogger } from "../../../shared/logger.js";
import { ENQUIRY_QUEUES } from "../shared/queues.js";
import { runMatching } from "../services/matching.service.js";
import { masterKnex } from "../../../core/db/master-pool.js";

const logger = createChildLogger("enquiry-match-worker");

await queueService.consume(ENQUIRY_QUEUES.CREATED, async (msg) => {
  const { enquiryId } = JSON.parse(msg!.content.toString());
  logger.info("Received enquiry.created", { enquiryId });

  await runMatching(enquiryId);

  const enquiry = await masterKnex("enquiries").where({ id: enquiryId }).first("status");
  if (enquiry?.status === "distributed") {
    await queueService.publish(ENQUIRY_QUEUES.DISTRIBUTED, { enquiryId });
  }

  logger.info("Matching complete", { enquiryId, status: enquiry?.status });
});

logger.info(`Enquiry match worker started — consuming "${ENQUIRY_QUEUES.CREATED}" queue`);
