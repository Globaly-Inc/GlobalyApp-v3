// Worker — consumes "ai_knowledge_crawl".
//
// For one rack source: discover its pages, scrape each to markdown, store any that
// changed, and embed them so match_ai_knowledge_documents() can retrieve them.
// Reuses the extraction module's scraper and LLM client rather than adding its own.
//
// Run with: npm run job:ai-knowledge-crawl

import "dotenv/config";
import { createHash } from "node:crypto";
import { masterKnex } from "../../../../core/db/master-pool.js";
import { queueService } from "../../../../shared/queue/queueService.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";
import { KNOWLEDGE_QUEUES } from "../shared/queues.js";
import { discoverUrlsForCrawl, politeDelay, scrapeMarkdown } from "../../data-extraction/lib/scraper.js";
import { embed, isConfigured as llmConfigured } from "../../data-extraction/lib/llm-client.js";

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
  embedded: number;
  max_pages: number;
  finished_at: string;
}

const hashOf = (markdown: string) => createHash("sha256").update(markdown).digest("hex");
const wordsIn = (markdown: string) => markdown.split(/\s+/).filter(Boolean).length;

/** First markdown heading, else the last meaningful path segment. */
function titleFor(markdown: string, url: string): string | null {
  const heading = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (heading) return heading.slice(0, 300);
  const segment = new URL(url).pathname.split("/").filter(Boolean).pop();
  return segment ? segment.replace(/[-_]+/g, " ").slice(0, 300) : null;
}

/**
 * Embedding is best-effort: a document with no vector is still useful to a human
 * reader, it just cannot be retrieved yet. Never fail the crawl over it.
 */
async function embedDocument(documentId: string, text: string): Promise<boolean> {
  if (!llmConfigured()) return false;
  try {
    const vector = await embed(text.slice(0, 8000));
    await masterKnex(DOCUMENTS)
      .where({ id: documentId })
      .update({ embedding: masterKnex.raw("?::vector", [`[${vector.join(",")}]`]) });
    return true;
  } catch (e) {
    logger.warn("Embedding failed", { documentId, error: (e as Error).message });
    return false;
  }
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
    scraped: 0, added: 0, updated: 0, unchanged: 0, failed: 0, embedded: 0,
    max_pages: maxPages, finished_at: "",
  };

  try {
    const discovery = await discoverUrlsForCrawl(source.url, { limit: maxPages });
    summary.discovery_method = discovery.method;
    summary.discovery_error = discovery.error ?? null;

    // Always include the seed itself, and never exceed the page budget.
    const urls = [...new Set([source.url, ...discovery.urls])].slice(0, maxPages);
    summary.discovered = urls.length;

    for (const url of urls) {
      const result = await scrapeMarkdown(url, { onlyMainContent: true });
      if (!result.markdown || result.markdown.length < MIN_CONTENT_LEN) {
        summary.failed++;
        logger.debug("Skipped thin or blocked page", { url, scraper: result.scraper });
        await politeDelay(DELAY_MIN_MS, DELAY_MAX_MS);
        continue;
      }
      summary.scraped++;

      const contentHash = hashOf(result.markdown);
      const existing = await masterKnex(DOCUMENTS).where({ source_id: sourceId, url }).first();

      if (existing?.content_hash === contentHash) {
        summary.unchanged++;
        await politeDelay(DELAY_MIN_MS, DELAY_MAX_MS);
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
        // Content moved on — the old vector is stale, so clear it before re-embedding.
        await masterKnex(DOCUMENTS).where({ id: existing.id })
          .update({ ...row, embedding: null, updated_at: masterKnex.fn.now() });
        documentId = existing.id;
        summary.updated++;
      } else {
        const [inserted] = await masterKnex(DOCUMENTS).insert(row).returning("id");
        documentId = inserted.id;
        summary.added++;
      }

      if (await embedDocument(documentId, `${row.title ?? ""}\n\n${result.markdown}`)) {
        summary.embedded++;
      }
      // Chunk-level embedding is the retrieval path (hybrid search runs over
      // ai_knowledge_chunks); the document-level vector above only feeds the older
      // match_ai_knowledge_documents(). Hand the document to the embed worker rather
      // than chunking inline so a slow provider never stalls the crawl.
      await queueService.publish(KNOWLEDGE_QUEUES.EMBED, { documentId });
      await politeDelay(DELAY_MIN_MS, DELAY_MAX_MS);
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
