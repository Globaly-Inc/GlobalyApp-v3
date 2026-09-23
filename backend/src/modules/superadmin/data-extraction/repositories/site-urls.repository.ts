// superadmin.extraction_site_urls — the discovered URL list a job's steps read from and write to.

import { masterKnex } from "../../../../core/db/master-pool.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";
import { normaliseUrl } from "../lib/page-store.js";
import { SITE_URL_CATEGORIES, type CategoryVerdict, type SiteUrlCategory, type SiteUrlCategorySource } from "../lib/url-categories.js";

const T = `${S}.extraction_site_urls`;

export type { SiteUrlCategorySource };

export interface SiteUrlRow {
  id: string;
  job_id: string;
  url: string;
  source: string;
  category: SiteUrlCategory | null;
  category_source: SiteUrlCategorySource | null;
  excluded: boolean;
  /** Set by the snapshot step when the page could not be read; null while the page is live. */
  dead_reason: DeadReason | null;
  created_at: Date;
  updated_at: Date;
}

export type DeadReason = "not_found" | "blocked" | "empty";

const CHUNK = 500;

/**
 * Insert what discovery found. A URL already on the list keeps its row untouched — in particular
 * `excluded` and an admin-set `category` survive every re-run of site_map. Returns how many were new.
 */
export async function upsertSiteUrls(
  jobId: string, items: { url: string; source: string; excluded?: boolean; category?: SiteUrlCategory }[],
): Promise<number> {
  const seen = new Set<string>();
  const rows: { job_id: string; url: string; source: string; excluded?: boolean; category?: SiteUrlCategory }[] = [];
  for (const it of items) {
    const url = normaliseUrl(it.url);
    if (seen.has(url)) continue;
    seen.add(url);
    rows.push({ job_id: jobId, url, source: it.source, ...(it.excluded !== undefined && { excluded: it.excluded }), ...(it.category && { category: it.category }) });
  }
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const saved = await masterKnex(T).insert(rows.slice(i, i + CHUNK)).onConflict(["job_id", "url"]).ignore().returning("id");
    inserted += saved.length;
  }
  return inserted;
}

/**
 * Admin adds a URL (page or PDF) with its category. A row discovery already found is taken over:
 * category pinned as admin-owned and un-excluded, so a suggested PDF the admin picks up is one
 * call, not restore + categorise. Returns the row id.
 */
export async function addSiteUrl(jobId: string, url: string, category: SiteUrlCategory): Promise<string> {
  const [row] = await masterKnex(T)
    .insert({ job_id: jobId, url: normaliseUrl(url), source: "admin", category, category_source: "admin", excluded: false })
    .onConflict(["job_id", "url"])
    .merge({ category, category_source: "admin", excluded: false, updated_at: masterKnex.fn.now() })
    .returning("id");
  return typeof row === "string" ? row : row.id;
}

/**
 * Every live, non-excluded URL for a job, in discovery order. What site_snapshot and url_classify
 * read. `includeDead` is for a `fresh` re-snapshot, which is the one place a dead page gets retried.
 */
export async function listActiveSiteUrls(jobId: string, opts: { includeDead?: boolean } = {}): Promise<Pick<SiteUrlRow, "id" | "url" | "source" | "category" | "category_source">[]> {
  return masterKnex(T).where({ job_id: jobId, excluded: false })
    .modify((qb) => { if (!opts.includeDead) qb.whereNull("dead_reason"); })
    .orderBy("created_at").select("id", "url", "source", "category", "category_source");
}

/** Live, non-excluded URLs in the given category — queue_pages sends `course` to the page queue. */
export async function listSiteUrlsByCategory(jobId: string, category: SiteUrlCategory): Promise<string[]> {
  const rows = await masterKnex(T).where({ job_id: jobId, excluded: false, category }).whereNull("dead_reason")
    .orderByRaw("(category_source = 'admin') DESC, created_at").select("url");
  return rows.map((r: { url: string }) => r.url);
}

/**
 * Write the classifier's verdicts, each with the source that produced IT (guided / heuristic / llm)
 * so the Site map's "Decided by" is true per row. An admin's own category is never overwritten by
 * a re-run — that is the one thing `category_source` exists to protect.
 */
export async function setSiteUrlCategories(jobId: string, verdicts: Map<string, CategoryVerdict>): Promise<void> {
  const groups = new Map<string, { verdict: CategoryVerdict; urls: string[] }>();
  for (const [url, verdict] of verdicts) {
    const key = `${verdict.category}|${verdict.source}`;
    const g = groups.get(key) ?? { verdict, urls: [] };
    g.urls.push(url);
    groups.set(key, g);
  }
  for (const { verdict, urls } of groups.values()) {
    for (let i = 0; i < urls.length; i += CHUNK) {
      await masterKnex(T)
        .where({ job_id: jobId })
        .whereIn("url", urls.slice(i, i + CHUNK))
        .where((w) => w.whereNull("category_source").orWhereNot("category_source", "admin"))
        .update({ category: verdict.category, category_source: verdict.source, updated_at: masterKnex.fn.now() });
    }
  }
}

export interface ListSiteUrlsFilter {
  category?: SiteUrlCategory | "unclassified";
  excluded?: boolean;
  q?: string;
}

/** Admin listing, paginated. */
export async function listSiteUrls(jobId: string, filter: ListSiteUrlsFilter, offset: number, limit: number) {
  const base = masterKnex(T).where({ job_id: jobId }).modify((qb) => {
    if (filter.category === "unclassified") qb.whereNull("category");
    else if (filter.category) qb.where({ category: filter.category });
    if (filter.excluded !== undefined) qb.where({ excluded: filter.excluded });
    if (filter.q) qb.whereILike("url", `%${filter.q}%`);
  });
  const [{ n }] = await base.clone().count({ n: "*" });
  const rows = await base.clone().orderBy("created_at").offset(offset).limit(limit)
    .select("id", "url", "source", "category", "category_source", "excluded", "created_at", "updated_at") as SiteUrlRow[];
  return { rows, total: Number(n) };
}

export type SiteUrlCounts = { total: number; unclassified: number; excluded: number; dead: number; by_category: Record<SiteUrlCategory, number> };

/** Counts for the tab header: total, per category (live, non-excluded), unclassified, excluded, dead. */
export async function siteUrlCounts(jobId: string): Promise<SiteUrlCounts> {
  const rows = (await masterKnex(T).where({ job_id: jobId })
    .select("category", "excluded", masterKnex.raw("dead_reason is not null as dead")).count({ n: "*" })
    .groupBy("category", "excluded", "dead")) as { category: SiteUrlCategory | null; excluded: boolean; dead: boolean; n: string }[];
  const by_category = Object.fromEntries(SITE_URL_CATEGORIES.map((c) => [c, 0])) as Record<SiteUrlCategory, number>;
  const counts: SiteUrlCounts = { total: 0, unclassified: 0, excluded: 0, dead: 0, by_category };
  for (const r of rows) {
    const n = Number(r.n);
    counts.total += n;
    if (r.excluded) { counts.excluded += n; continue; }
    if (r.dead) { counts.dead += n; continue; }
    if (r.category && r.category in by_category) by_category[r.category] += n;
    else counts.unclassified += n;
  }
  return counts;
}

/** Admin edit: exclude/include, or set a category (which pins it as admin-owned). */
export async function patchSiteUrl(id: string, patch: { excluded?: boolean; category?: SiteUrlCategory | null }): Promise<boolean> {
  const update: Record<string, unknown> = { updated_at: masterKnex.fn.now() };
  if (patch.excluded !== undefined) update.excluded = patch.excluded;
  if (patch.category !== undefined) { update.category = patch.category; update.category_source = patch.category === null ? null : "admin"; }
  const n = await masterKnex(T).where({ id }).update(update);
  return n > 0;
}

/**
 * The snapshot step's verdict on liveness. `dead` rows are marked with their reason; `alive` rows
 * that were previously dead are cleared. Two statements per batch, keyed on the normalised url.
 */
export async function setSiteUrlLiveness(jobId: string, dead: { url: string; reason: DeadReason }[], alive: string[]): Promise<void> {
  const byReason = new Map<DeadReason, string[]>();
  for (const d of dead) byReason.set(d.reason, [...(byReason.get(d.reason) ?? []), normaliseUrl(d.url)]);
  for (const [reason, urls] of byReason) {
    for (let i = 0; i < urls.length; i += CHUNK) {
      await masterKnex(T).where({ job_id: jobId }).whereIn("url", urls.slice(i, i + CHUNK))
        .update({ dead_reason: reason, updated_at: masterKnex.fn.now() });
    }
  }
  const revived = alive.map(normaliseUrl);
  for (let i = 0; i < revived.length; i += CHUNK) {
    await masterKnex(T).where({ job_id: jobId }).whereNotNull("dead_reason").whereIn("url", revived.slice(i, i + CHUNK))
      .update({ dead_reason: null, updated_at: masterKnex.fn.now() });
  }
}

export async function bulkSetExcluded(jobId: string, ids: string[], excluded: boolean): Promise<number> {
  if (ids.length === 0) return 0;
  return masterKnex(T).where({ job_id: jobId }).whereIn("id", ids).update({ excluded, updated_at: masterKnex.fn.now() });
}

export async function deleteSiteUrls(jobId: string): Promise<void> {
  await masterKnex(T).where({ job_id: jobId }).delete();
}

export async function countSiteUrls(jobId: string): Promise<number> {
  const [{ n }] = await masterKnex(T).where({ job_id: jobId }).count({ n: "*" });
  return Number(n);
}
