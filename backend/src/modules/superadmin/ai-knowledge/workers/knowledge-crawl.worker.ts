// Worker — consumes "ai_knowledge_crawl".
//
// For one rack source: discover its pages, scrape each to markdown, store any that
// changed, and chunk + embed them so match_ai_knowledge_chunks() can retrieve them.
// Reuses the extraction module's scraper and LLM client rather than adding its own.
//
// Pages are read through getPage(), so a page the extraction pipeline already snapshotted
// to GCS (extraction/www/<site>/…/<page>.md) is read from that file and never re-scraped.
// An institution-owned source (the embed widget's site index) goes further: its URL list
// IS the institution's extraction job's site list, so the rack index is built from exactly
// the markdown files in the bucket — the corpus the counsellor falls back to when the
// structured DB has nothing for a question (rag.service searchAll, embed mode).
//
// Run with: npm run job:ai-knowledge-crawl

import "dotenv/config";
import { masterKnex } from "../../../../core/db/master-pool.js";
import { queueService } from "../../../../shared/queue/queueService.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";
import { KNOWLEDGE_QUEUES } from "../shared/queues.js";
import { discoverUrlsForCrawl, politeDelay } from "../../data-extraction/lib/scraper.js";
import { getPage } from "../../data-extraction/lib/page-store.js";
import { listActiveSiteUrls } from "../../data-extraction/repositories/site-urls.repository.js";
import { contentHashOf, ingestDocumentChunks, wordsIn } from "../lib/ingest.js";

const logger = createChildLogger("ai-knowledge-crawl-worker");

const SOURCES = `${S}.ai_knowledge_sources`;
const DOCUMENTS = `${S}.ai_knowledge_documents`;

const DEFAULT_MAX_PAGES = 25;
// Same courtesy gap the extraction crawler uses — these are mostly government sites.
const DELAY_MIN_MS = 400;
const DELAY_MAX_MS = 1200;
const MIN_CONTENT_LEN = 200;

interface CrawlSummary {
  discovered: number;
  discovery_method: string;
  discovery_error: string | null;
  scraped: number;
  added: number;
  updated: number;
  unchanged: number;
  failed: number;
  chunks: number;
  embedded: number;
  max_pages: number;
  finished_at: string;
}

/** First markdown heading, else the last meaningful path segment. */
function titleFor(markdown: string, url: string): string | null {
  const heading = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (heading) return heading.slice(0, 300);
  const segment = new URL(url).pathname.split("/").filter(Boolean).pop();
  return segment ? segment.replace(/[-_]+/g, " ").slice(0, 300) : null;
}

/** The institution's extraction job's live site list — the pages snapshotted to GCS. [] when
 *  it has no job or the job has not run discovery yet, so the caller falls back to discovery. */
async function snapshotUrlsForInstitution(institutionId: number): Promise<string[]> {
  const inst = await masterKnex("institutions").where({ id: institutionId }).select("source_job_id").first();
  if (!inst?.source_job_id) return [];
  const rows = await listActiveSiteUrls(inst.source_job_id);
  return rows.map((r) => r.url);
}

async function crawlSource(sourceId: string, maxPagesOverride?: number): Promise<void> {
  const source = await masterKnex(SOURCES).where({ id: sourceId }).first();
  if (!source) {
    logger.warn("Source no longer exists", { sourceId });
    return;
  }

  const maxPages = maxPagesOverride ?? source.max_pages ?? DEFAULT_MAX_PAGES;
  await masterKnex(SOURCES).where({ id: sourceId }).update({
    last_status: "crawling",
    last_error: null,
    updated_at: masterKnex.fn.now(),
  });

  const summary: CrawlSummary = {
    discovered: 0, discovery_method: "seed-only", discovery_error: null,
    scraped: 0, added: 0, updated: 0, unchanged: 0, failed: 0, chunks: 0, embedded: 0,
    max_pages: maxPages, finished_at: "",
  };

  try {
    let urls: string[];
    const snapshotUrls = source.institution_id != null ? await snapshotUrlsForInstitution(Number(source.institution_id)) : [];
    if (snapshotUrls.length) {
      // The job's site list is already bounded by its page_cap and is the set of files in
      // the bucket, so it is taken whole rather than cut at max_pages.
      urls = [...new Set([source.url, ...snapshotUrls])];
      summary.discovery_method = "extraction-snapshot";
    } else {
      const discovery = await discoverUrlsForCrawl(source.url, { limit: maxPages });
      summary.discovery_method = discovery.method;
      summary.discovery_error = discovery.error ?? null;
      // Always include the seed itself, and never exceed the page budget.
      urls = [...new Set([source.url, ...discovery.urls])].slice(0, maxPages);
    }
    summary.discovered = urls.length;

    for (const url of urls) {
      // Bucket hit → no fetch, no delay to be polite about.
      const result = await getPage(url, { onlyMainContent: true });
      if (!result.markdown || result.markdown.length < MIN_CONTENT_LEN) {
        summary.failed++;
        logger.debug("Skipped thin or blocked page", { url, scraper: result.scraper });
        if (!result.fromCache) await politeDelay(DELAY_MIN_MS, DELAY_MAX_MS);
        continue;
      }
      summary.scraped++;

      const contentHash = contentHashOf(result.markdown);
      const existing = await masterKnex(DOCUMENTS).where({ source_id: sourceId, url }).first();

      if (existing?.content_hash === contentHash) {
        summary.unchanged++;
        if (!result.fromCache) await politeDelay(DELAY_MIN_MS, DELAY_MAX_MS);
        continue;
      }

      const row = {
        source_id: sourceId,
        category_id: source.category_id,
        url,
        title: titleFor(result.markdown, url),
        markdown: result.markdown,
        content_hash: contentHash,
        word_count: wordsIn(result.markdown),
        crawled_at: masterKnex.fn.now(),
        active: true,
      };

      let documentId: string;
      if (existing) {
        // Content moved on — ingestDocumentChunks below replaces this document's chunks.
        await masterKnex(DOCUMENTS).where({ id: existing.id })
          .update({ ...row, updated_at: masterKnex.fn.now() });
        documentId = existing.id;
        summary.updated++;
      } else {
        const [inserted] = await masterKnex(DOCUMENTS).insert(row).returning("id");
        documentId = inserted.id;
        summary.added++;
      }

      // Chunking replaces this document's old chunks, so a re-crawl never leaves
      // text behind that is no longer on the page. Never fail the crawl over it.
      try {
        const ingested = await ingestDocumentChunks(documentId, result.markdown, { title: row.title });
        summary.chunks += ingested.chunks;
        summary.embedded += ingested.embedded;
      } catch (e) {
        logger.warn("Chunking failed", { documentId, error: (e as Error).message });
      }
      if (!result.fromCache) await politeDelay(DELAY_MIN_MS, DELAY_MAX_MS);
    }

    summary.finished_at = new Date().toISOString();
    const [{ c }] = await masterKnex(DOCUMENTS).where({ source_id: sourceId, active: true }).count("* as c");

    await masterKnex(SOURCES).where({ id: sourceId }).update({
      last_status: summary.scraped > 0 ? "ok" : "no_content",
      last_error: null,
      last_crawled_at: masterKnex.fn.now(),
      doc_count: Number(c),
      crawl_summary: JSON.stringify(summary),
      updated_at: masterKnex.fn.now(),
    });

    logger.info("Crawl complete", { sourceId, ...summary });
  } catch (e) {
    const message = (e as Error).message || String(e);
    summary.finished_at = new Date().toISOString();
    await masterKnex(SOURCES).where({ id: sourceId }).update({
      last_status: "failed",
      last_error: message,
      last_crawled_at: masterKnex.fn.now(),
      crawl_summary: JSON.stringify(summary),
      updated_at: masterKnex.fn.now(),
    });
    logger.error("Crawl failed", { sourceId, error: message });
  }
}

// ── Consumer ──

await queueService.consume(KNOWLEDGE_QUEUES.CRAWL, async (msg) => {
  let sourceId: string;
  let maxPages: number | undefined;
  try {
    ({ sourceId, maxPages } = JSON.parse(msg!.content.toString()));
  } catch {
    logger.error("Malformed queue message, discarding", { raw: msg?.content.toString().slice(0, 200) });
    return;
  }
  if (!sourceId) {
    logger.error("Queue message missing sourceId, discarding");
    return;
  }

  logger.info("Received rack crawl", { sourceId, maxPages });
  await crawlSource(sourceId, maxPages);
});

logger.info(`AI Knowledge crawl worker started — consuming "${KNOWLEDGE_QUEUES.CRAWL}" queue`);
