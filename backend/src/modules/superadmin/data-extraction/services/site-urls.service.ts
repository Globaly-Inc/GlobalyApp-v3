// Site URL list + snapshot listing for the admin's Site tab.

import { masterKnex } from "../../../../core/db/master-pool.js";
import { NotFoundError } from "../../../../shared/errors.js";
import { buildPaginatedResponse, paginationToOffset } from "../../../../shared/pagination.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";
import { logAudit } from "../shared/audit.js";
import * as repo from "../repositories/site-urls.repository.js";
import * as pageEdits from "../repositories/page-edits.repository.js";
import { readSnapshot, snapshotPathFor } from "../lib/page-store.js";
import { queueService } from "../../../../shared/queue/queueService.js";
import { SELF_SERVICE_QUEUES } from "../shared/self-service-queues.js";
import type { ListSiteUrlsQuery, PatchSiteUrlInput, BulkExcludeInput, ListSnapshotsQuery, AddSiteUrlInput } from "../schemas/site-urls.schema.js";

async function requireJob(jobId: string) {
  const job = await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).select("id").first();
  if (!job) throw new NotFoundError("Extraction job not found");
}

export async function listSiteUrls(jobId: string, query: ListSiteUrlsQuery) {
  await requireJob(jobId);
  const { offset, limit } = paginationToOffset(query);
  const [{ rows, total }, counts] = await Promise.all([
    repo.listSiteUrls(jobId, { category: query.category, excluded: query.excluded, q: query.q }, offset, limit),
    repo.siteUrlCounts(jobId),
  ]);
  // Explicit allow-list, never the row spread.
  const data = rows.map((r) => ({
    id: r.id, url: r.url, source: r.source, category: r.category, category_source: r.category_source, excluded: r.excluded,
    created_at: r.created_at, updated_at: r.updated_at,
  }));
  return { ...buildPaginatedResponse(data, total, query), counts };
}

export async function addSiteUrl(jobId: string, input: AddSiteUrlInput, adminId: number) {
  await requireJob(jobId);
  const id = await repo.addSiteUrl(jobId, input.url, input.category);
  await logAudit(adminId, "SITE_URL_ADD", { entityType: "extraction_site_urls", entityId: id, details: input });
  return { id };
}

export async function patchSiteUrl(id: string, input: PatchSiteUrlInput, adminId: number) {
  const found = await repo.patchSiteUrl(id, input);
  if (!found) throw new NotFoundError("Site URL not found");
  await logAudit(adminId, "SITE_URL_PATCH", { entityType: "extraction_site_urls", entityId: id, details: input });
  return { updated: true };
}

export async function bulkExclude(jobId: string, input: BulkExcludeInput, adminId: number) {
  await requireJob(jobId);
  const updated = await repo.bulkSetExcluded(jobId, input.ids, input.excluded);
  await logAudit(adminId, "SITE_URL_BULK_EXCLUDE", { entityType: "extraction_jobs", entityId: jobId, details: { count: updated, excluded: input.excluded } });
  return { updated };
}

/** Snapshots (extraction_pages rows) for the URLs on this job's site list. Read-only. */
export async function listSnapshots(jobId: string, query: ListSnapshotsQuery) {
  await requireJob(jobId);
  const { offset, limit } = paginationToOffset(query);
  const base = masterKnex(`${S}.extraction_pages as p`)
    .join(`${S}.extraction_site_urls as su`, function () {
      this.on("su.url", "=", "p.url").andOn("su.job_id", "=", masterKnex.raw("?", [jobId]));
    })
    .where("p.mode", "main")
    .modify((qb) => { if (query.q) qb.whereILike("p.url", `%${query.q}%`); });
  const [{ n }] = await base.clone().countDistinct({ n: "p.id" });
  // One row per page without DISTINCT ON: extraction_site_urls is unique on (job_id, url) and the
  // page side is pinned to mode 'main'. Newest fetch first; id only breaks ties deterministically.
  const rows = await base.clone()
    .orderBy([{ column: "p.scraped_at", order: "desc" }, { column: "p.id" }])
    .offset(offset).limit(limit)
    .select(
      "p.id", "p.url", "p.scraper", "p.scraped_at", "p.content_hash",
      masterKnex.raw("jsonb_array_length(p.links) as link_count"),
      "su.id as site_url_id", "su.category", "su.category_source", "su.excluded",
    ) as Array<{ id: string; url: string; scraper: string; scraped_at: Date; content_hash: string; link_count: number; site_url_id: string; category: string | null; category_source: string | null; excluded: boolean }>;
  const data = rows.map((r) => ({
    id: r.id, url: r.url, scraper: r.scraper, scraped_at: r.scraped_at, content_hash: r.content_hash,
    link_count: Number(r.link_count), site_url_id: r.site_url_id, category: r.category, category_source: r.category_source, excluded: r.excluded,
    gcs_path: snapshotPathFor(r.url),
  }));
  return buildPaginatedResponse(data, Number(n), query);
}

/** One snapshot's markdown, read from its .md file, for the read-only viewer. */
export async function getSnapshotMarkdown(jobId: string, pageId: string) {
  await requireJob(jobId);
  // Pages are shared across jobs (keyed by URL, not job), so the id alone proves nothing about
  // THIS job. Scope through the job's own site list, exactly as listSnapshots does — a page id
  // from job B under job A's URL is a 404, not B's markdown.
  const row = await masterKnex(`${S}.extraction_pages as p`)
    .join(`${S}.extraction_site_urls as su`, function () {
      this.on("su.url", "=", "p.url").andOn("su.job_id", "=", masterKnex.raw("?", [jobId]));
    })
    .where("p.id", pageId).select("p.id", "p.url", "p.mode").first();
  const page = row && await readSnapshot(row.url, row.mode);
  if (!page) throw new NotFoundError("Snapshot not found on this job — or its file is gone from the bucket; the next read of this page scrapes it again");
  return { id: row.id, url: row.url, scraped_at: page.scraped_at, markdown: page.markdown };
}

/**
 * Self-service twin of getSnapshotMarkdown, keyed by URL instead of extraction_pages.id — the
 * self-service Site card (businesses/institutions "View" action) only ever has the site_urls row,
 * not a page id. Scoped identically: the URL must belong to THIS job's own site list, so an org
 * can never read another org's snapshot by guessing a URL.
 */
export async function getSnapshotMarkdownByUrl(jobId: string, url: string) {
  await requireJob(jobId);
  const owns = await masterKnex(`${S}.extraction_site_urls`).where({ job_id: jobId, url }).first("id");
  if (!owns) throw new NotFoundError("This page isn't part of this job's site");
  // This job's own correction, if it has one — kept apart from the shared row so a job never
  // reads another job's edit of a URL they happen to have in common.
  const edit = await pageEdits.findManualEdit(jobId, url);
  if (edit) return { url, scraped_at: edit.updated_at, markdown: edit.markdown, edited: true };
  const page = await readSnapshot(url, "main");
  if (!page) throw new NotFoundError("Snapshot not found — it may not have been scraped yet");
  return { url, scraped_at: page.scraped_at, markdown: page.markdown, edited: false };
}

export async function updateSnapshotMarkdown(jobId: string, url: string, markdown: string, editorId: number) {
  await requireJob(jobId);
  const owns = await masterKnex(`${S}.extraction_site_urls`).where({ job_id: jobId, url }).first("id");
  if (!owns) throw new NotFoundError("This page isn't part of this job's site");
  const edit = await pageEdits.upsertManualEdit(jobId, url, markdown, editorId);
  return { url, scraped_at: edit.updated_at, markdown: edit.markdown, edited: true };
}

export async function refreshSiteUrls(jobId: string, urls: string[]) {
  await requireJob(jobId);
  const owned = new Set(
    await masterKnex(`${S}.extraction_site_urls`).where({ job_id: jobId }).whereIn("url", urls).pluck("url"),
  );
  const queued: string[] = [];
  const rejected: { url: string; error: string }[] = [];
  for (const url of urls) {
    if (!owned.has(url)) { rejected.push({ url, error: "Not part of this job's site" }); continue; }
    // An explicit refresh means "show me what's live now" — drop this job's own correction so it
    // doesn't keep masking the fresh pull that's about to happen.
    await pageEdits.deleteManualEdit(jobId, url);
    await queueService.publish(SELF_SERVICE_QUEUES.SITE_URL_REFRESH, { url });
    queued.push(url);
  }
  return { queued, rejected };
}
