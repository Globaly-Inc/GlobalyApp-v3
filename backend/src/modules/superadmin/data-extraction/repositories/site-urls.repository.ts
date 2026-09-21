// superadmin.extraction_site_urls — the discovered URL list a job's steps read from and write to.

import { masterKnex } from "../../../../core/db/master-pool.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";
import { normaliseUrl } from "../lib/page-store.js";

const T = `${S}.extraction_site_urls`;

export type SiteUrlRole = "course" | "other";
export type SiteUrlRoleSource = "heuristic" | "llm" | "admin";

export interface SiteUrlRow {
  id: string;
  job_id: string;
  url: string;
  source: string;
  role: SiteUrlRole | null;
  role_source: SiteUrlRoleSource | null;
  excluded: boolean;
  created_at: Date;
  updated_at: Date;
}

const CHUNK = 500;

/**
 * Insert what discovery found. A URL already on the list keeps its row untouched — in particular
 * `excluded` and an admin-set `role` survive every re-run of site_map. Returns how many were new.
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
export async function listActiveSiteUrls(jobId: string): Promise<Pick<SiteUrlRow, "id" | "url" | "source" | "role" | "role_source">[]> {
  return masterKnex(T).where({ job_id: jobId, excluded: false }).orderBy("created_at").select("id", "url", "source", "role", "role_source");
}

/** Non-excluded URLs with the given role — what queue_pages sends to the page queue. */
export async function listSiteUrlsByRole(jobId: string, role: SiteUrlRole): Promise<string[]> {
  const rows = await masterKnex(T).where({ job_id: jobId, excluded: false, role }).orderBy("created_at").select("url");
  return rows.map((r: { url: string }) => r.url);
}

/**
 * Write the classifier's verdicts. An admin's own role is never overwritten by a re-run — that is
 * the one thing `role_source` exists to protect.
 */
export async function setSiteUrlRoles(jobId: string, roles: Map<string, SiteUrlRole>, source: Exclude<SiteUrlRoleSource, "admin">): Promise<void> {
  const byRole: Record<SiteUrlRole, string[]> = { course: [], other: [] };
  for (const [url, role] of roles) byRole[role].push(url);
  for (const role of Object.keys(byRole) as SiteUrlRole[]) {
    const urls = byRole[role];
    for (let i = 0; i < urls.length; i += CHUNK) {
      await masterKnex(T)
        .where({ job_id: jobId })
        .whereIn("url", urls.slice(i, i + CHUNK))
        .where((w) => w.whereNull("role_source").orWhereNot("role_source", "admin"))
        .update({ role, role_source: source, updated_at: masterKnex.fn.now() });
    }
  }
}

export interface ListSiteUrlsFilter {
  role?: SiteUrlRole | "unclassified";
  excluded?: boolean;
  q?: string;
}

/** Admin listing, paginated. */
export async function listSiteUrls(jobId: string, filter: ListSiteUrlsFilter, offset: number, limit: number) {
  const base = masterKnex(T).where({ job_id: jobId }).modify((qb) => {
    if (filter.role === "unclassified") qb.whereNull("role");
    else if (filter.role) qb.where({ role: filter.role });
    if (filter.excluded !== undefined) qb.where({ excluded: filter.excluded });
    if (filter.q) qb.whereILike("url", `%${filter.q}%`);
  });
  const [{ n }] = await base.clone().count({ n: "*" });
  const rows = await base.clone().orderBy("created_at").offset(offset).limit(limit)
    .select("id", "url", "source", "role", "role_source", "excluded", "created_at", "updated_at") as SiteUrlRow[];
  return { rows, total: Number(n) };
}

/** Counts for the tab header: total, per role, excluded. */
export async function siteUrlCounts(jobId: string) {
  const rows = await masterKnex(T).where({ job_id: jobId })
    .select("role", "excluded").count({ n: "*" }).groupBy("role", "excluded") as { role: string | null; excluded: boolean; n: string }[];
  const counts = { total: 0, course: 0, other: 0, unclassified: 0, excluded: 0 };
  for (const r of rows) {
    const n = Number(r.n);
    counts.total += n;
    if (r.excluded) { counts.excluded += n; continue; }
    if (r.role === "course") counts.course += n;
    else if (r.role === "other") counts.other += n;
    else counts.unclassified += n;
  }
  return counts;
}

/** Admin edit: exclude/include, or set a role (which pins it as admin-owned). */
export async function patchSiteUrl(id: string, patch: { excluded?: boolean; role?: SiteUrlRole | null }): Promise<boolean> {
  const update: Record<string, unknown> = { updated_at: masterKnex.fn.now() };
  if (patch.excluded !== undefined) update.excluded = patch.excluded;
  if (patch.role !== undefined) { update.role = patch.role; update.role_source = patch.role === null ? null : "admin"; }
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
