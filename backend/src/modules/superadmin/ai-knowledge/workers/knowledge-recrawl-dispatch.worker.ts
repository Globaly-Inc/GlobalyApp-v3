// Worker — publishes due rack sources to the crawl queue.
//
// Phase 9. A source with crawl_frequency 'weekly' or 'monthly' was only ever
// re-crawled when an admin clicked Crawl, so the corpus aged silently. This walks
// the idx_akd_sources_due index and dispatches whatever is overdue; the crawl worker
// does the actual fetching, chunking and embedding.
//
// Uploaded files are excluded — there is no page to re-fetch, and replacing an
// uploaded document means uploading a new one.
//
// Long-running: polls hourly. Run with: npm run job:ai-knowledge-recrawl
// One-shot (external cron): pass --once

import "dotenv/config";
import { masterKnex } from "../../../../core/db/master-pool.js";
import { queueService } from "../../../../shared/queue/queueService.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";
import { KNOWLEDGE_QUEUES } from "../shared/queues.js";

const logger = createChildLogger("ai-knowledge-recrawl-worker");

const SOURCES = `${S}.ai_knowledge_sources`;

/** Days before a source of each cadence is due again. */
const CADENCE_DAYS: Record<string, number> = { weekly: 7, monthly: 30 };

/** Dispatched per run — a courtesy cap so one pass can't flood the crawl queue. */
const BATCH = 25;

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

interface DueSource {
  id: string;
  url: string | null;
  crawl_frequency: string;
  max_pages: number | null;
  last_crawled_at: Date | null;
}

async function dispatchDue(): Promise<number> {
  const candidates: DueSource[] = await masterKnex(SOURCES)
    .select("id", "url", "crawl_frequency", "max_pages", "last_crawled_at")
    .where({ active: true, source_type: "url" })
    .whereNot("crawl_frequency", "off")
    // A crawl already queued or running must not be queued twice.
    .whereNotIn("last_status", ["queued", "crawling"])
    .orderByRaw("last_crawled_at ASC NULLS FIRST")
    .limit(BATCH * 2);

  const due = candidates.filter((s) => {
    const window = CADENCE_DAYS[s.crawl_frequency];
    if (!window) return false;
    // Never crawled counts as due.
    return !s.last_crawled_at || new Date(s.last_crawled_at) <= daysAgo(window);
  }).slice(0, BATCH);

  if (!due.length) {
    logger.info("No sources due");
    return 0;
  }

  let dispatched = 0;
  for (const source of due) {
    try {
      await queueService.publish(KNOWLEDGE_QUEUES.CRAWL, {
        sourceId: source.id,
        maxPages: source.max_pages ?? undefined,
      });
      // Marked queued immediately so the next poll skips it even if the crawl
      // worker is slow to pick it up.
      await masterKnex(SOURCES).where({ id: source.id }).update({
        last_status: "queued",
        last_error: null,
        updated_at: masterKnex.fn.now(),
      });
      dispatched++;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logger.error("Dispatch failed", { sourceId: source.id, error: message });
    }
  }

  logger.info("Recrawl dispatch complete", { due: due.length, dispatched });
  return dispatched;
}

const POLL_MS = 60 * 60 * 1000; // hourly — cadences are measured in days

if (process.argv[2] === "--once") {
  try {
    await dispatchDue();
  } finally {
    await masterKnex.destroy();
    process.exit(0);
  }
} else {
  logger.info(`Recrawl dispatcher started — polling every ${POLL_MS / 60000} minutes`);
  await dispatchDue();
  // ponytail: setInterval poll, no overlap guard — a run is a handful of queue
  // publishes and marking rows 'queued' makes a repeat pass a no-op.
  setInterval(() => {
    dispatchDue().catch((e) =>
      logger.error("Poll failed", { error: e instanceof Error ? e.message : String(e) }),
    );
  }, POLL_MS);
}
