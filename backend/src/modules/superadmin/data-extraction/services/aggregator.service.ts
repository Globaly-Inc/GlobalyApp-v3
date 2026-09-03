// Aggregator extraction service — detects provider, scrapes listings, queues course pages.

import { BadRequestError } from "../../../../shared/errors.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { queueService } from "../../../../shared/queue/queueService.js";
import { masterKnex } from "../../../../core/db/master-pool.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";
import { logAudit } from "../shared/audit.js";
import { EXTRACTION_QUEUES } from "../shared/queues.js";
import { detectAggregator } from "../lib/aggregator/index.js";
import { scrapeMarkdown } from "../lib/scraper.js";
import { writeInstitutionOverview, insertQueueItem, writeJobEvent } from "../lib/staging-writer.js";

const logger = createChildLogger("aggregator-service");

export async function extractFromAggregator(
  url: string,
  adminId: number,
): Promise<{ jobId: string; aggregator: string; institution: Record<string, unknown>; coursesQueued: number }> {
  const provider = detectAggregator(url);
  if (!provider) {
    throw new BadRequestError(
      "URL not recognised as a supported aggregator. Supported: Hotcourses/IDP, MastersPortal.",
    );
  }

  logger.info("Detected aggregator", { aggregator: provider.name, url });

  // 1. Create extraction job
  const [jobRow] = await masterKnex(`${S}.extraction_jobs`)
    .insert({
      institution_url: url,
      source_type: "aggregator",
      aggregator_name: provider.name,
      status: "extracting",
    })
    .returning("id");

  const jobId = jobRow.id;

  await logAudit(adminId, "EXTRACTION_JOB_CREATE", {
    entityType: "extraction_jobs",
    entityId: jobId,
    details: { institution_url: url, source_type: "aggregator", aggregator_name: provider.name },
  });

  await writeJobEvent(jobId, "aggregator_start", {
    phase: "aggregator_discovery",
    message: `Extracting from ${provider.name}`,
    data: { url },
  });

  // 2. Run provider extraction — uses scrapeMarkdown under the hood
  const result = await provider.extractListing(url, async (scrapeUrl) => {
    const r = await scrapeMarkdown(scrapeUrl, { onlyMainContent: false, withLinks: true });
    return { markdown: r.markdown, links: r.links };
  });

  // 3. Save institution overview
  if (result.institution.name || result.institution.description) {
    await writeInstitutionOverview(jobId, {
      name: result.institution.name,
      description: result.institution.description,
      website: result.institution.website,
      city: result.institution.city,
      state: result.institution.state,
      country: result.institution.country,
      source_url: url,
    });

    if (result.institution.name) {
      await masterKnex(`${S}.extraction_jobs`)
        .where({ id: jobId })
        .update({ institution_name: result.institution.name, updated_at: masterKnex.fn.now() });
    }
  }

  // 4. Queue each course URL → existing page worker
  let queued = 0;
  for (const courseUrl of result.courseUrls) {
    const queueItemId = await insertQueueItem(jobId, courseUrl);
    if (!queueItemId) continue; // already queued by another producer
    try {
      await queueService.publish(EXTRACTION_QUEUES.PAGES, {
        jobId,
        queueItemId,
        url: courseUrl,
      });
      queued++;
    } catch (err) {
      // ponytail: queue unavailable — item stays pending, worker can poll DB
      logger.warn("Queue publish failed for course URL", { jobId, courseUrl });
    }
  }

  await writeJobEvent(jobId, "aggregator_complete", {
    phase: "aggregator_discovery",
    message: `Discovered ${result.courseUrls.length} courses, queued ${queued}`,
    data: { courseCount: result.courseUrls.length, queued },
  });

  // Update pipeline progress
  await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).update({
    pipeline_progress: JSON.stringify({
      aggregator_discovery: "done",
      data_extraction: queued > 0 ? "processing" : "done",
    }),
    updated_at: masterKnex.fn.now(),
  });

  logger.info("Aggregator extraction complete", { jobId, aggregator: provider.name, coursesQueued: queued });

  return {
    jobId,
    aggregator: provider.name,
    institution: result.institution,
    coursesQueued: queued,
  };
}
