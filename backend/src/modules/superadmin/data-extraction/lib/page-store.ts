// Cache-aside around scrapeMarkdown (and Gemini-vision PDF extraction), backed by
// superadmin.extraction_pages. Step 3 of the cost-reduction design.
//
// Every worker calls getPage() where it used to call scrapeMarkdown() and gets the SAME
// result shape back plus provenance (pageId, contentHash, fromCache, changed), so the
// callers' `if (page.blocked || page.markdown.length < 50)` branches and retry ladders are
// untouched. A stored page within the freshness window is returned without touching the
// scraper; anything else is scraped, stored, and returned.

import { createHash } from "node:crypto";
import { masterKnex } from "../../../../core/db/master-pool.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";
import { scrapeMarkdown, type ScrapeOptions, type ScrapeResult } from "./scraper.js";
import { createDocumentExtractor } from "./document-extractor.js";
import { domainOf, stripMarkdownJunk } from "./html-utils.js";

const logger = createChildLogger("page-store");
const TABLE = `${S}.extraction_pages`;

/** Env kill-switch for a new cache in a production pipeline: PAGE_SNAPSHOTS=0. */
const ENABLED = process.env.PAGE_SNAPSHOTS !== "0";
/** Fees and intakes move on a yearly cycle; 30 days is conservative for all of them. */
const DEFAULT_MAX_AGE_DAYS = Number(process.env.PAGE_SNAPSHOT_MAX_AGE_DAYS) || 30;
/** Nothing real is this big after stripMarkdownJunk (applied in getPage); a hostile page must not be either. */
const MAX_STORED_CHARS = 1_000_000;
/** Same floor every caller already applies. */
const MIN_USABLE_CHARS = 50;

export type PageMode = "main" | "full";

export interface PageOptions extends ScrapeOptions {
  /** Reuse a stored snapshot no older than this. Default PAGE_SNAPSHOT_MAX_AGE_DAYS (30). */
  maxAgeDays?: number;
  /** Bypass the store for the read — the retry ladder and verify set this. The result is still stored. */
  fresh?: boolean;
}

export interface Page extends Omit<ScrapeResult, "scraper"> {
  scraper: ScrapeResult["scraper"] | "pdf-vision";
  /** extraction_pages.id, null when nothing was stored (failure, or snapshots disabled). */
  pageId: string | null;
  contentHash: string | null;
  fromCache: boolean;
  /** Only meaningful on a real fetch: did the content differ from what was stored before? */
  changed: boolean;
}

interface StoredPage {
  id: string;
  markdown: string;
  links: string[];
  content_hash: string;
  scraper: Page["scraper"];
  scraped_at: Date;
}

// ── Test seam: the scraper, Vision, the table and the clock ──
export const _pageDeps = {
  scrape: (url: string, opts: ScrapeOptions) => scrapeMarkdown(url, opts),
  extractDocument: async (url: string): Promise<{ text: string; error?: string }> => {
    const fileName = url.split("/").pop()?.split("?")[0] || "document.pdf";
    return createDocumentExtractor().extract({ file_url: url, file_name: fileName });
  },
  findPage: async (url: string, mode: PageMode): Promise<StoredPage | undefined> =>
    masterKnex(TABLE).where({ url, mode }).select("id", "markdown", "links", "content_hash", "scraper", "scraped_at").first(),
  savePage: async (row: {
    url: string; mode: PageMode; domain: string; markdown: string; links: string[]; content_hash: string; scraper: string;
  }): Promise<string> => {
    const [saved] = await masterKnex(TABLE)
      .insert({ ...row, links: JSON.stringify(row.links) })
      .onConflict(["url", "mode"])
      .merge({
        markdown: row.markdown, links: JSON.stringify(row.links), content_hash: row.content_hash,
        scraper: row.scraper, scraped_at: masterKnex.fn.now(), updated_at: masterKnex.fn.now(),
      })
      .returning("id");
    return typeof saved === "string" ? saved : saved.id;
  },
  now: () => Date.now(),
};

/**
 * The cache key. Two spellings of one page must be one row or the cache is useless:
 * scheme, `www.`, default port, fragment, tracking params, param order and a trailing slash
 * are all presentation, not identity. Key only — the fetch itself uses the caller's URL.
 */
export function normaliseUrl(raw: string): string {
  try {
    const u = new URL(raw.includes("://") ? raw.trim() : `https://${raw.trim()}`);
    u.protocol = "https:";
    u.hash = "";
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$|ref$)/i.test(key)) u.searchParams.delete(key);
    }
    u.searchParams.sort();
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) u.pathname = u.pathname.slice(0, -1);
    return u.toString();
  } catch {
    return raw.trim();
  }
}

/** onlyMainContent defaults to true in the scraper, so only an explicit false is the full page. */
export function modeFor(opts: ScrapeOptions): PageMode {
  return opts.onlyMainContent === false ? "full" : "main";
}

export const isPdfUrl = (url: string): boolean => /\.pdf(\?|#|$)/i.test(url);

const hashOf = (markdown: string) => createHash("sha256").update(markdown).digest("hex");
const ageDays = (at: Date) => (_pageDeps.now() - new Date(at).getTime()) / 86_400_000;
const usable = (markdown: string) => markdown.length >= MIN_USABLE_CHARS;

async function lookup(key: string, mode: PageMode): Promise<StoredPage | undefined> {
  if (!ENABLED) return undefined;
  // A lookup failure is a miss, never an error — the scraper is still there to ask.
  return _pageDeps.findPage(key, mode).catch((err) => {
    logger.warn("Page snapshot lookup failed — treating as miss", { key, err: String(err) });
    return undefined;
  });
}

function fromStored(stored: StoredPage, withLinks: boolean | undefined): Page {
  return {
    markdown: stored.markdown,
    links: withLinks ? stored.links : [],
    scraper: stored.scraper,
    pageId: stored.id,
    contentHash: stored.content_hash,
    fromCache: true,
    changed: false,
  };
}

async function store(
  url: string, key: string, mode: PageMode, markdown: string, links: string[], scraper: string,
): Promise<string | null> {
  if (!ENABLED) return null;
  return _pageDeps
    .savePage({ url: key, mode, domain: domainOf(url), markdown: markdown.slice(0, MAX_STORED_CHARS), links, content_hash: hashOf(markdown), scraper })
    .catch((err) => {
      logger.warn("Failed to store page snapshot", { key, err: String(err) });
      return null;
    });
}

/** scrapeMarkdown, through the snapshot table. */
export async function getPage(url: string, opts: PageOptions = {}): Promise<Page> {
  const key = normaliseUrl(url);
  const mode = modeFor(opts);
  const { maxAgeDays = DEFAULT_MAX_AGE_DAYS, fresh = false, ...scrapeOpts } = opts;

  // Read the stored row even on a fresh fetch — it is what `changed` is measured against.
  const stored = await lookup(key, mode);
  if (stored && !fresh && ageDays(stored.scraped_at) <= maxAgeDays) return fromStored(stored, opts.withLinks);

  // Links are always extracted for the row, so a later caller that wants them gets them;
  // the caller that asked for none still gets none, exactly as scrapeMarkdown behaves.
  const scraped = await _pageDeps.scrape(url, { ...scrapeOpts, withLinks: true });
  // Cleaned ONCE here, so the row, the GCS snapshot and every reader see the same text and
  // content_hash does not flip on a rotated base64 favicon or an HTML comment.
  const result = { ...scraped, markdown: stripMarkdownJunk(scraped.markdown) };
  const links = opts.withLinks ? result.links : [];
  if (result.blocked || result.notFound || !usable(result.markdown)) {
    return { ...result, links, pageId: null, contentHash: null, fromCache: false, changed: false };
  }

  const contentHash = hashOf(result.markdown);
  const pageId = await store(url, key, mode, result.markdown, result.links, result.scraper);
  return {
    ...result,
    links,
    pageId: pageId ?? stored?.id ?? null,
    contentHash,
    fromCache: false,
    changed: stored ? stored.content_hash !== contentHash : false,
  };
}

/**
 * A PDF, through the same table. The Vision text is the "markdown" and the row says so
 * (scraper 'pdf-vision'). This is the single most repeated paid call in the pipeline — the
 * same fees PDF re-read from every message that needed it — so it is the first to benefit.
 */
export async function getDocument(url: string, opts: Pick<PageOptions, "maxAgeDays" | "fresh"> = {}): Promise<Page> {
  const key = normaliseUrl(url);
  const { maxAgeDays = DEFAULT_MAX_AGE_DAYS, fresh = false } = opts;

  const stored = await lookup(key, "main");
  if (stored && !fresh && ageDays(stored.scraped_at) <= maxAgeDays) return fromStored(stored, false);

  const result = await _pageDeps.extractDocument(url);
  const text = result.text ?? "";
  if (!usable(text)) {
    return { markdown: "", links: [], scraper: "pdf-vision", error: result.error, pageId: null, contentHash: null, fromCache: false, changed: false };
  }

  const contentHash = hashOf(text);
  const pageId = await store(url, key, "main", text, [], "pdf-vision");
  return {
    markdown: text, links: [], scraper: "pdf-vision",
    pageId: pageId ?? stored?.id ?? null, contentHash, fromCache: false,
    changed: stored ? stored.content_hash !== contentHash : false,
  };
}
