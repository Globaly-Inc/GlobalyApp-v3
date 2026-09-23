// Cache-aside around scrapeMarkdown (and Gemini-vision PDF extraction). The MARKDOWN lives in
// GCS, one .md file per page (snapshotPathFor); superadmin.extraction_pages holds the metadata —
// id, links, content_hash, scraper, scraped_at — and a blank `markdown` column when the file is
// the source of truth. Without a bucket the column holds the text, as it did before 2026-09-21.
//
// Every worker calls getPage() where it used to call scrapeMarkdown() and gets the SAME
// result shape back plus provenance (pageId, contentHash, fromCache, changed), so the
// callers' `if (page.blocked || page.markdown.length < 50)` branches and retry ladders are
// untouched. A stored page within the freshness window is read back from its file; a row whose
// file is missing, or whose file no longer hashes to the row, is a MISS: the page is scraped live
// (Scrapling) and re-stored. That fallback is the whole contract — the file is authoritative and
// its absence is never an error.

import { createHash } from "node:crypto";
import { masterKnex } from "../../../../core/db/master-pool.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";
import { scrapeMarkdown, type ScrapeOptions, type ScrapeResult } from "./scraper.js";
import { createDocumentExtractor } from "./document-extractor.js";
import { domainOf, siteOf, stripMarkdownJunk } from "./html-utils.js";
import { downloadFile, isConfigured, uploadFile } from "../../../../shared/storage/storageService.js";

const logger = createChildLogger("page-store");
const TABLE = `${S}.extraction_pages`;

/** Env kill-switch for a new cache in a production pipeline: PAGE_SNAPSHOTS=0. */
const ENABLED = process.env.PAGE_SNAPSHOTS !== "0";
export const SNAPSHOT_PREFIX = "extraction/www";
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
  /** The hash that was stored BEFORE this call, null when nothing was. `changed` alone cannot say
   *  "first ever fetch" apart from "unchanged", and verify needs that distinction. */
  previousHash: string | null;
}

export interface StoredPage {
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
  // The bucket. Null/false when no bucket is configured, so the row carries the text instead.
  readObject: async (path: string): Promise<string | null> => {
    if (!isConfigured()) return null;
    const buf = await downloadFile(path);
    return buf ? buf.toString("utf8") : null;
  },
  writeObject: async (path: string, body: string): Promise<boolean> => {
    if (!isConfigured()) return false;
    await uploadFile(path, Buffer.from(body, "utf8"), "text/markdown");
    return true;
  },
};

// ── The .md file ─────────────────────────────────────────────────────────────

const FILE_LINK = /\.(pdf|docx?|xlsx?|pptx?|jpe?g|png|gif|svg|webp)(\?[^#]*)?(#.*)?$/i;

/** Image and document URLs among a page's links, deduped, in page order. Pure. */
export function fileLinksOf(links: string[]): string[] {
  return [...new Set(links.filter((l) => FILE_LINK.test(l)))];
}

/**
 * GCS object path for a page: extraction/www/<site>/<host>/<slug>-<digest>.md, with `.full.md`
 * for the whole-page mode so a homepage read both ways is two files, like it is two rows.
 * Pure and deterministic per URL, so a re-scrape overwrites that page's own file.
 *
 * The readable half is lossy ON PURPOSE (lowercased, extensions dropped, punctuation collapsed,
 * truncated) — it exists so a human can find a page in the bucket. Lossy means COLLIDING:
 * /a-b and /a_b both slug to "a-b", as do two paths differing past 180 chars or only by query
 * string, and an upload overwrites whatever was there — one page's snapshot silently lost. The
 * digest of the normalised URL restores uniqueness while keeping the name readable.
 */
export function snapshotPathFor(url: string, mode: PageMode = "main"): string {
  const u = new URL(url);
  // Normalised like the digest below, or one page reached as both example.edu and www.example.edu
  // writes two objects with identical content — the same "rerun accumulates" failure, one level up.
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const slug = decodeURIComponent(u.pathname)
    .replace(/\.(html?|php|aspx?|jsp)$/i, "")
    .split("/").filter(Boolean)
    .map((seg) => seg.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""))
    .filter(Boolean)
    .join("_") || "index";
  const digest = createHash("sha256").update(normaliseUrl(url)).digest("hex").slice(0, 8);
  return `${SNAPSHOT_PREFIX}/${siteOf(url)}/${host}/${slug.slice(0, 180)}-${digest}${mode === "full" ? ".full" : ""}.md`;
}

/** The marker is an HTML comment because stripMarkdownJunk removes those from page text, so it
 *  cannot occur inside the markdown it fences off. */
const LINKED_FILES_MARK = "\n\n<!-- linked-files -->\n## Linked files\n";

/** Front-matter, the markdown, then the page's image/document links — discovery drops asset
 *  URLs from the crawl list, so the page's own file is where they are recorded. Pure. */
export function renderSnapshotFile(meta: { url: string; mode: PageMode; scraper: string; scrapedAt: string }, markdown: string, links: string[]): string {
  const files = fileLinksOf(links);
  return `---\nurl: ${meta.url}\nmode: ${meta.mode}\nscraper: ${meta.scraper}\nscraped_at: ${meta.scrapedAt}\n---\n\n${markdown}\n`
    + (files.length ? `${LINKED_FILES_MARK}\n${files.map((f) => `- ${f}`).join("\n")}\n` : "");
}

/** Inverse of renderSnapshotFile: the markdown exactly as stored, so it re-hashes to the row. Pure. */
export function parseSnapshotFile(body: string): string {
  const afterHeader = body.replace(/^---\n[\s\S]*?\n---\n\n/, "");
  const cut = afterHeader.indexOf(LINKED_FILES_MARK);
  const md = cut >= 0 ? afterHeader.slice(0, cut) : afterHeader;
  return md.endsWith("\n") ? md.slice(0, -1) : md;
}

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

/** URL lists in priority order, deduped on normaliseUrl (www./trailing-slash spellings collapse), capped. Pure. */
export function mergeUrlLists(lists: string[][], max: number): string[] {
  const seen = new Set<string>();
  return lists.flat().filter((u) => { const k = normaliseUrl(u); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, max);
}

/** onlyMainContent defaults to true in the scraper, so only an explicit false is the full page. */
export function modeFor(opts: ScrapeOptions): PageMode {
  return opts.onlyMainContent === false ? "full" : "main";
}

export const isPdfUrl = (url: string): boolean => /\.pdf(\?|#|$)/i.test(url);

const hashOf = (markdown: string) => createHash("sha256").update(markdown).digest("hex");
const ageDays = (at: Date) => (_pageDeps.now() - new Date(at).getTime()) / 86_400_000;
const usable = (markdown: string) => markdown.length >= MIN_USABLE_CHARS;

/**
 * The row, with its markdown read back from the .md file when the row says the file has it
 * (blank column). A lookup failure, a missing file or a file that no longer hashes to the row is
 * a MISS, never an error — the scraper is still there to ask, and the re-store rewrites both.
 */
async function lookup(key: string, mode: PageMode): Promise<StoredPage | undefined> {
  if (!ENABLED) return undefined;
  try {
    const row = await _pageDeps.findPage(key, mode);
    if (!row || row.markdown) return row;
    const body = await _pageDeps.readObject(snapshotPathFor(key, mode));
    if (body == null) { logger.warn("Snapshot file missing for stored page — will scrape live", { key, mode }); return undefined; }
    const markdown = parseSnapshotFile(body);
    if (hashOf(markdown) !== row.content_hash) { logger.warn("Snapshot file does not match its row — will scrape live", { key, mode }); return undefined; }
    return { ...row, markdown };
  } catch (err) {
    logger.warn("Page snapshot lookup failed — treating as miss", { key, err: String(err) });
    return undefined;
  }
}

/** A stored page by URL, file included. Undefined when there is none (or the file is gone). Never scrapes. */
export const readSnapshot = (url: string, mode: PageMode = "main") => lookup(normaliseUrl(url), mode);

function fromStored(stored: StoredPage, withLinks: boolean | undefined): Page {
  return {
    markdown: stored.markdown,
    links: withLinks ? stored.links : [],
    scraper: stored.scraper,
    pageId: stored.id,
    contentHash: stored.content_hash,
    fromCache: true,
    changed: false,
    previousHash: stored.content_hash,
  };
}

async function store(
  url: string, key: string, mode: PageMode, markdown: string, links: string[], scraper: string,
): Promise<string | null> {
  if (!ENABLED) return null;
  // One bound for file, row and hash. Nothing real is this long after stripMarkdownJunk; a hostile
  // page must not become an unbounded GCS write on every fresh rerun, and the hash has to be of
  // the text actually stored or the file could never re-hash to its row on read.
  const bounded = markdown.slice(0, MAX_STORED_CHARS);
  if (bounded.length < markdown.length) logger.warn("Page markdown truncated for storage", { key, chars: markdown.length, kept: bounded.length });
  // The file first, so a row never claims a file that was not written. A failed upload (or no
  // bucket) keeps the text in the row — the pipeline runs either way, the bucket is where it
  // lives when there is one.
  const inFile = await _pageDeps
    .writeObject(snapshotPathFor(key, mode), renderSnapshotFile({ url: key, mode, scraper, scrapedAt: new Date(_pageDeps.now()).toISOString() }, bounded, links))
    .catch((err) => { logger.warn("Failed to upload page snapshot file — keeping text in the row", { key, err: String(err) }); return false; });
  return _pageDeps
    .savePage({ url: key, mode, domain: domainOf(url), markdown: inFile ? "" : bounded, links, content_hash: hashOf(bounded), scraper })
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
    return { ...result, links, pageId: null, contentHash: null, fromCache: false, changed: false, previousHash: stored?.content_hash ?? null };
  }

  const contentHash = hashOf(result.markdown.slice(0, MAX_STORED_CHARS)); // same text store() hashes
  const pageId = await store(url, key, mode, result.markdown, result.links, result.scraper);
  return {
    ...result,
    links,
    pageId: pageId ?? stored?.id ?? null,
    contentHash,
    fromCache: false,
    changed: stored ? stored.content_hash !== contentHash : false,
    previousHash: stored?.content_hash ?? null,
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
    return { markdown: "", links: [], scraper: "pdf-vision", error: result.error, pageId: null, contentHash: null, fromCache: false, changed: false, previousHash: stored?.content_hash ?? null };
  }

  const contentHash = hashOf(text.slice(0, MAX_STORED_CHARS)); // same text store() hashes
  const pageId = await store(url, key, "main", text, [], "pdf-vision");
  return {
    markdown: text, links: [], scraper: "pdf-vision",
    pageId: pageId ?? stored?.id ?? null, contentHash, fromCache: false,
    changed: stored ? stored.content_hash !== contentHash : false,
    previousHash: stored?.content_hash ?? null,
  };
}
