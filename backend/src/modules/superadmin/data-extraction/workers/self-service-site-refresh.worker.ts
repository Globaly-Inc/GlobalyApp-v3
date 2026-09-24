import "dotenv/config";
import { queueService } from "../../../../shared/queue/queueService.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { SELF_SERVICE_QUEUES } from "../shared/self-service-queues.js";
import { refreshLivePage } from "../lib/page-store.js";
import { triggerCourseReExtraction } from "../services/site-urls.service.js";

const logger = createChildLogger("self-service-site-refresh-worker");

await queueService.consume(SELF_SERVICE_QUEUES.SITE_URL_REFRESH, async (msg) => {
  const { url, jobId, editorId } = JSON.parse(msg!.content.toString());
  logger.info("Refreshing page from live site", { url });

  const page = await refreshLivePage(url);
  if (!page.pageId) {
    logger.warn("Page refresh produced no usable content — stored snapshot left unchanged", { url, blocked: page.blocked, notFound: page.notFound });
    return;
  }
  logger.info("Page refreshed", { url });
  if (page.changed && jobId && editorId) {
    await triggerCourseReExtraction(jobId, url, editorId).catch((err) =>
      logger.warn("Couldn't trigger course re-extraction after a live refresh", { jobId, url, err: String(err) }));
  }
});

logger.info(`Self-service site refresh worker started — consuming "${SELF_SERVICE_QUEUES.SITE_URL_REFRESH}" queue`);
