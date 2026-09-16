// Site snapshot: right after site mapping, every discovered same-site URL is fetched (through
// the extraction_pages cache, so the page worker later gets cache hits instead of re-scraping)
// and its markdown is uploaded to GCS as one .md file PER PAGE, grouped per site:
//
//   extraction/www/<site domain>/<hostname>/<path slug>.md
//   extraction/www/mit.edu/www.mit.edu/index.md
//   extraction/www/mit.edu/catalog.mit.edu/about_overview.md
//
// Deterministic paths, so a rerun overwrites rather than accumulates.
// Images and documents the page links to are listed at the end of its file under "Linked files"
// — discovery drops asset URLs from the crawl list, so this is where they are recorded.

import { masterKnex } from "../../../../core/db/master-pool.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { isConfigured, uploadFile } from "../../../../shared/storage/storageService.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";
import { getPage } from "./page-store.js";
import { politeDelay } from "./scraper.js";
import { siteOf } from "./html-utils.js";
import { writeJobEvent } from "./staging-writer.js";

const logger = createChildLogger("site-snapshot");
export const SNAPSHOT_PREFIX = "extraction/www";

const FILE_LINK = /\.(pdf|docx?|xlsx?|pptx?|jpe?g|png|gif|svg|webp)(\?[^#]*)?(#.*)?$/i;

/** Image and document URLs among a page's links, deduped, in page order. Pure. */
export function fileLinksOf(links: string[]): string[] {
  return [...new Set(links.filter((l) => FILE_LINK.test(l)))];
}

/** GCS object path for a page. Pure. */
export function snapshotPathFor(url: string): string {
  const u = new URL(url);
  const host = u.hostname.toLowerCase();
  const slug = decodeURIComponent(u.pathname)
    .replace(/\.(html?|php|aspx?|jsp)$/i, "")
    .split("/").filter(Boolean)
    .map((seg) => seg.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""))
    .filter(Boolean)
    .join("_") || "index";
  // ponytail: query strings are dropped from the name — two ?page= variants collide on purpose
  return `${SNAPSHOT_PREFIX}/${siteOf(url)}/${host}/${slug.slice(0, 180)}.md`;
}

/** Pages per step message. A crash mid-step loses one batch, not the whole site, and the
 *  concurrent STEPS consumer works batches in parallel. */
export const SNAPSHOT_BATCH_SIZE = 100;

async function jobHalted(jobId: string): Promise<boolean> {
  const job = await masterKnex(`${S}.extraction_jobs`).where({ id: jobId })
    .select("status", "stop_requested").first();
  return !job || !!job.stop_requested || ["paused", "failed", "declined"].includes(job.status);
}

export async function snapshotSite(jobId: string, urls: string[], batch?: { index: number; total: number }): Promise<number> {
  if (!isConfigured()) {
    logger.warn("GCS not configured, skipping site snapshot", { jobId });
    return 0;
  }
  const label = batch ? ` (batch ${batch.index}/${batch.total})` : "";
  let uploaded = 0;
  let processed = 0;
  let halted = false;
  const failed: string[] = [];
  for (const url of urls) {
    if (processed % 25 === 0) {
      if (await jobHalted(jobId)) { halted = true; break; }
      await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).update({ processing_heartbeat_at: masterKnex.fn.now() });
    }
    processed++;
    try {
      // ponytail: no retry here — Scrapling already walks get → stealthy_fetch → browser fetch
      // internally, and a Firecrawl escalation would bill credits the account may not have.
      const page = await getPage(url, { onlyMainContent: true, withLinks: true });
      if (page.blocked || page.notFound || page.markdown.length < 50) { failed.push(url); continue; }
      const files = fileLinksOf(page.links);
      const body = `---\nurl: ${url}\njob_id: ${jobId}\nscraped_at: ${new Date().toISOString()}\n---\n\n${page.markdown}\n`
        + (files.length ? `\n## Linked files\n\n${files.map((f) => `- ${f}`).join("\n")}\n` : "");
      await uploadFile(snapshotPathFor(url), Buffer.from(body, "utf8"), "text/markdown");
      uploaded++;
      if (!page.fromCache) await politeDelay(300, 900);
    } catch (err) {
      failed.push(url);
      logger.warn("Snapshot failed", { jobId, url, err: String(err) });
    }
  }
  await writeJobEvent(jobId, "site_snapshot_uploaded", {
    phase: "site_mapping",
    level: halted || failed.length ? "warn" : "info",
    message: halted
      ? `Site snapshot stopped${label}: job paused or stop requested after ${processed} of ${urls.length} pages`
      : `${uploaded} of ${urls.length} pages written to ${SNAPSHOT_PREFIX}/${urls[0] ? siteOf(urls[0]) : ""}${label}`,
    data: { uploaded, processed, failed: failed.length, failed_sample: failed.slice(0, 10), halted, ...(batch ?? {}) },
  });
  return uploaded;
}
