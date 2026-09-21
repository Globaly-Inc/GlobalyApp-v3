// Site URL list + snapshot listing for the admin's Site URLs / Snapshots tabs.

import { masterKnex } from "../../../../core/db/master-pool.js";
import { NotFoundError } from "../../../../shared/errors.js";
import { buildPaginatedResponse, paginationToOffset } from "../../../../shared/pagination.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";
import { logAudit } from "../shared/audit.js";
import * as repo from "../repositories/site-urls.repository.js";
import { readSnapshot, snapshotPathFor } from "../lib/page-store.js";
import type { ListSiteUrlsQuery, PatchSiteUrlInput, BulkExcludeInput, ListSnapshotsQuery } from "../schemas/site-urls.schema.js";

async function requireJob(jobId: string) {
  const job = await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).select("id").first();
  if (!job) throw new NotFoundError("Extraction job not found");
}

export async function listSiteUrls(jobId: string, query: ListSiteUrlsQuery) {
  await requireJob(jobId);
  const { offset, limit } = paginationToOffset(query);
  const [{ rows, total }, counts] = await Promise.all([
    repo.listSiteUrls(jobId, { role: query.role, excluded: query.excluded, q: query.q }, offset, limit),
    repo.siteUrlCounts(jobId),
  ]);
  // Explicit allow-list, never the row spread.
  const data = rows.map((r) => ({
    id: r.id, url: r.url, source: r.source, role: r.role, role_source: r.role_source, excluded: r.excluded,
    created_at: r.created_at, updated_at: r.updated_at,
  }));
  return { ...buildPaginatedResponse(data, total, query), counts };
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
  const rows = await base.clone()
    .distinctOn("p.id")
    .orderBy([{ column: "p.id" }, { column: "p.scraped_at", order: "desc" }])
    .offset(offset).limit(limit)
    .select(
      "p.id", "p.url", "p.scraper", "p.scraped_at", "p.content_hash",
      masterKnex.raw("jsonb_array_length(p.links) as link_count"),
      "su.role", "su.excluded",
    ) as Array<{ id: string; url: string; scraper: string; scraped_at: Date; content_hash: string; link_count: number; role: string | null; excluded: boolean }>;
  const data = rows.map((r) => ({
    id: r.id, url: r.url, scraper: r.scraper, scraped_at: r.scraped_at, content_hash: r.content_hash,
    link_count: Number(r.link_count), role: r.role, excluded: r.excluded,
    gcs_path: snapshotPathFor(r.url),
  }));
  return buildPaginatedResponse(data, Number(n), query);
}

/** One snapshot's markdown, read from its .md file, for the read-only viewer. */
export async function getSnapshotMarkdown(jobId: string, pageId: string) {
  await requireJob(jobId);
  const row = await masterKnex(`${S}.extraction_pages`).where({ id: pageId }).select("id", "url", "mode").first();
  const page = row && await readSnapshot(row.url, row.mode);
  if (!page) throw new NotFoundError("Snapshot not found — its file is gone from the bucket; the next read of this page scrapes it again");
  return { id: row.id, url: row.url, scraped_at: page.scraped_at, markdown: page.markdown };
}
