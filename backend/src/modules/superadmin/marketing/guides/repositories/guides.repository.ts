import { masterKnex } from "../../../../../core/db/master-pool.js";

const now = () => masterKnex.fn.now();
const TABLE = "superadmin.guides";
const LEADS_TABLE = "superadmin.guide_leads";

type GuideFilters = { search?: string; is_published?: boolean };

// Lead counts drive the admin listing — LEFT JOIN + GROUP BY so a guide with zero leads
// still shows a row (an INNER JOIN would silently drop it).
export async function listGuides(limit: number, offset: number, filters: GuideFilters) {
  const q = masterKnex(`${TABLE} as g`)
    .whereNull("g.deleted_at")
    .leftJoin(`${LEADS_TABLE} as l`, "l.guide_id", "g.id")
    .groupBy("g.id")
    .select("g.*")
    .count("l.id as lead_count")
    .orderBy("g.created_at", "desc")
    .limit(limit)
    .offset(offset);
  if (filters.search) q.whereILike("g.title", `%${filters.search}%`);
  if (filters.is_published !== undefined) q.where({ "g.is_published": filters.is_published });
  return q;
}

export async function countGuides(filters: GuideFilters) {
  const q = masterKnex(`${TABLE} as g`).whereNull("g.deleted_at").count("* as count");
  if (filters.search) q.whereILike("g.title", `%${filters.search}%`);
  if (filters.is_published !== undefined) q.where({ "g.is_published": filters.is_published });
  const [row] = await q;
  return Number(row.count);
}

export async function findGuideById(id: number) {
  return masterKnex(TABLE).where({ id }).whereNull("deleted_at").first();
}

export async function findGuideBySlug(slug: string, excludeId?: number) {
  const q = masterKnex(TABLE).where({ slug }).whereNull("deleted_at");
  if (excludeId) q.whereNot({ id: excludeId });
  return q.first();
}

export async function insertGuide(data: Record<string, unknown>) {
  const [row] = await masterKnex(TABLE).insert(data).returning("*");
  return row;
}

export async function updateGuide(id: number, data: Record<string, unknown>) {
  const [row] = await masterKnex(TABLE).where({ id }).update({ ...data, updated_at: now() }).returning("*");
  return row;
}

export async function deleteGuide(id: number) {
  return masterKnex(TABLE).where({ id }).update({ deleted_at: now() });
}

// ─── Public reads (is_published = true only, never returns pdf_url — see service) ────────

export async function findPublishedGuideBySlug(slug: string) {
  return masterKnex(TABLE).where({ slug, is_published: true }).whereNull("deleted_at").first();
}
