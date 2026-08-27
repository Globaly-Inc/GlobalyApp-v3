import { masterKnex } from "../../../../../core/db/master-pool.js";

const TABLE = "superadmin.seo_keyword_snapshots";

export type SnapshotRow = {
  keyword: string;
  date: string; // YYYY-MM-DD
  position: number | null;
  impressions: number;
  clicks: number;
  ctr: number | null;
};

/** Tracked keyword set = union of blog_keywords.keyword and blog_posts.focus_keyword
 * (non-null, published or not) — per the plan's tracked-keyword contract. */
export async function trackedKeywords(): Promise<string[]> {
  const [keywordRows, focusRows] = await Promise.all([
    masterKnex("superadmin.blog_keywords").distinct("keyword"),
    masterKnex("superadmin.blog_posts").whereNotNull("focus_keyword").whereNull("deleted_at").distinct("focus_keyword"),
  ]);
  const set = new Set<string>();
  for (const r of keywordRows) if (r.keyword) set.add(r.keyword as string);
  for (const r of focusRows) if (r.focus_keyword) set.add(r.focus_keyword as string);
  return [...set];
}

export async function upsertSnapshots(rows: SnapshotRow[]): Promise<void> {
  if (rows.length === 0) return;
  await masterKnex(TABLE).insert(rows).onConflict(["keyword", "date"]).merge();
}

/** Last 28 days of snapshots for the given keywords, oldest first. */
export async function listRecentSnapshots(keywords: string[], sinceDate: string) {
  if (keywords.length === 0) return [];
  return masterKnex(TABLE).whereIn("keyword", keywords).where("date", ">=", sinceDate).orderBy("date", "asc");
}

export async function listPublishedPostsForReadiness() {
  return masterKnex("superadmin.blog_posts")
    .where({ is_published: true })
    .whereNull("deleted_at")
    .select("id", "title", "slug", "content", "meta_description");
}
