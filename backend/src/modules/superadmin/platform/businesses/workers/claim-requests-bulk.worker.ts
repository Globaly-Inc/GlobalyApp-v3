// Worker — processes bulk "send claim request" jobs queued by the admin businesses UI.
// Run with: npm run job:business-claim-requests

import "dotenv/config";
import { queueService } from "../../../../../shared/queue/queueService.js";
import { createChildLogger } from "../../../../../shared/logger.js";
import * as service from "../services/businesses.service.js";

const logger = createChildLogger("business-claim-requests-worker");

await queueService.consume("business_claim_requests_bulk", async (msg) => {
  const { ids } = JSON.parse(msg!.content.toString()) as { ids: number[] };
  for (const id of ids) {
    try {
      await service.sendClaimRequest(id);
    } catch (err) {
      logger.warn("Bulk claim request failed for business", { id, err: (err as Error).message });
    }
  }
  logger.info("Bulk claim requests processed", { count: ids.length });
});

logger.info("Business claim-requests worker started — consuming 'business_claim_requests_bulk' queue");
