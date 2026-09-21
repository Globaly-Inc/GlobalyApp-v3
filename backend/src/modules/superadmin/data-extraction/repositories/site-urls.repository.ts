// superadmin.extraction_site_urls — the discovered URL list a job's steps read from and write to.

import { masterKnex } from "../../../../core/db/master-pool.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";
import { normaliseUrl } from "../lib/page-store.js";
import { SITE_URL_CATEGORIES, type SiteUrlCategory } from "../lib/url-categories.js";

const T = `${S}.extraction_site_urls`;

export type SiteUrlCategorySource = "heuristic" | "llm" | "admin";

export interface SiteUrlRow {
  id: string;
  job_id: string;
  url: string;
  source: string;
  category: SiteUrlCategory | null;
  category_source: SiteUrlCategorySource | null;
  excluded: boolean;
  created_at: Date;
  updated_at: Date;
}

const CHUNK = 500;

/**
 * Insert what discovery found. A URL already on the list keeps its row untouched — in particular
 * `excluded` and an admin-set `category` survive every re-run of site_map. Returns how many were new.
 */
export async function upsertSiteUrls(jobId: string, items: { url: string; source: string }[]): Promise<number> {
  const seen = new Set<string>();
  const rows: { job_id: string; url: string; source: string }[] = [];
  for (const it of items) {
    const url = normaliseUrl(it.url);
    if (seen.has(url)) continue;
    seen.add(url);
    rows.push({ job_id: jobId, url, source: it.source });
  }
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const saved = await masterKnex(T).insert(rows.slice(i, i + CHUNK)).onConflict(["job_id", "url"]).ignore().returning("id");
    inserted += saved.length;
  }
  return inserted;
}

/** Every non-excluded URL for a job, in discovery order. What site_snapshot and url_classify read. */
export async function listActiveSiteUrls(jobId: string): Promise<Pick<SiteUrlRow, "id" | "url" | "source" | "category" | "category_source">[]> {
  return masterKnex(T).where({ job_id: jobId, excluded: false }).orderBy("created_at").select("id", "url", "source", "category", "category_source");
}

/** Non-excluded URLs in the given category — queue_pages sends `course` to the page queue. */
export async function listSiteUrlsByCategory(jobId: string, category: SiteUrlCategory): Promise<string[]> {
  const rows = await masterKnex(T).where({ job_id: jobId, excluded: false, category }).orderBy("created_at").select("url");
  return rows.map((r: { url: string }) => r.url);
}

/**
 * Write the classifier's verdicts. An admin's own category is never overwritten by a re-run — that
 * is the one thing `category_source` exists to protect.
 */
export async function setSiteUrlCategories(jobId: string, categories: Map<string, SiteUrlCategory>, source: Exclude<SiteUrlCategorySource, "admin">): Promise<void> {
  const byCategory = new Map<SiteUrlCategory, string[]>();
  for (const [url, category] of categories) byCategory.set(category, [...(byCategory.get(category) ?? []), url]);
  for (const [category, urls] of byCategory) {
    for (let i = 0; i < urls.length; i += CHUNK) {
      await masterKnex(T)
        .where({ job_id: jobId })
        .whereIn("url", urls.slice(i, i + CHUNK))
        .where((w) => w.whereNull("category_source").orWhereNot("category_source", "admin"))
        .update({ category, category_source: source, updated_at: masterKnex.fn.now() });
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

export type SiteUrlCounts = { total: number; unclassified: number; excluded: number; by_category: Record<SiteUrlCategory, number> };

/** Counts for the tab header: total, per category (non-excluded), unclassified, excluded. */
export async function siteUrlCounts(jobId: string): Promise<SiteUrlCounts> {
  const rows = await masterKnex(T).where({ job_id: jobId })
    .select("category", "excluded").count({ n: "*" }).groupBy("category", "excluded") as { category: SiteUrlCategory | null; excluded: boolean; n: string }[];
  const by_category = Object.fromEntries(SITE_URL_CATEGORIES.map((c) => [c, 0])) as Record<SiteUrlCategory, number>;
  const counts: SiteUrlCounts = { total: 0, unclassified: 0, excluded: 0, by_category };
  for (const r of rows) {
    const n = Number(r.n);
    counts.total += n;
    if (r.excluded) { counts.excluded += n; continue; }
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
