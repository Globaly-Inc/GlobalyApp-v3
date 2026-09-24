import "dotenv/config";
import { queueService } from "../../../../shared/queue/queueService.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { SELF_SERVICE_QUEUES } from "../shared/self-service-queues.js";
import { refreshLivePage } from "../lib/page-store.js";

const logger = createChildLogger("self-service-site-refresh-worker");

await queueService.consume(SELF_SERVICE_QUEUES.SITE_URL_REFRESH, async (msg) => {
  const { url } = JSON.parse(msg!.content.toString());
  logger.info("Refreshing page from live site", { url });

  await refreshLivePage(url);

  logger.info("Page refreshed", { url });
});

logger.info(`Self-service site refresh worker started — consuming "${SELF_SERVICE_QUEUES.SITE_URL_REFRESH}" queue`);
