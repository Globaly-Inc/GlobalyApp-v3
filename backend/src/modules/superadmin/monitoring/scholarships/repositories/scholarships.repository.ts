// Scholarships repository — admin-managed content (see categories/countries for the same pattern).

import { masterKnex } from "../../../../../core/db/master-pool.js";

const TABLE = "scholarships";
const now = () => masterKnex.fn.now();

type AdminFilters = { search?: string; is_published?: boolean; country?: string };
type PublicFilters = { q?: string; country?: string };

function applyAdminFilters(q: ReturnType<typeof masterKnex>, filters: AdminFilters) {
  if (filters.search) {
    q.where((b) => b.whereILike("title", `%${filters.search}%`).orWhereILike("provider_name", `%${filters.search}%`));
  }
  if (filters.is_published !== undefined) q.where({ is_published: filters.is_published });
  if (filters.country) q.where({ country: filters.country });
  return q;
}

export async function listAdmin(limit: number, offset: number, filters: AdminFilters) {
  const q = masterKnex(TABLE).orderBy("created_at", "desc").limit(limit).offset(offset);
  return applyAdminFilters(q, filters);
}

export async function countAdmin(filters: AdminFilters) {
  const q = masterKnex(TABLE).count("* as count");
  applyAdminFilters(q, filters);
  const [row] = await q;
  return Number(row.count);
}

export async function findById(id: number) {
  return masterKnex(TABLE).where({ id }).first();
}

export async function insert(data: Record<string, unknown>) {
  const [row] = await masterKnex(TABLE).insert(data).returning("*");
  return row;
}

export async function update(id: number, data: Record<string, unknown>) {
  const [row] = await masterKnex(TABLE).where({ id }).update({ ...data, updated_at: now() }).returning("*");
  return row;
}

export async function remove(id: number) {
  return masterKnex(TABLE).where({ id }).delete();
}

// ── Public reads (published only) ──

function applyPublicFilters(q: ReturnType<typeof masterKnex>, filters: PublicFilters) {
  if (filters.q) {
    q.where((b) => b.whereILike("title", `%${filters.q}%`).orWhereILike("provider_name", `%${filters.q}%`));
  }
  if (filters.country) q.where({ country: filters.country });
  return q;
}

export async function listPublished(limit: number, offset: number, filters: PublicFilters) {
  const q = masterKnex(TABLE).where({ is_published: true })
    .orderBy("is_featured", "desc").orderBy("deadline", "asc").limit(limit).offset(offset);
  return applyPublicFilters(q, filters);
}

export async function countPublished(filters: PublicFilters) {
  const q = masterKnex(TABLE).where({ is_published: true }).count("* as count");
  applyPublicFilters(q, filters);
  const [row] = await q;
  return Number(row.count);
}

export async function findPublishedBySlug(slug: string) {
  return masterKnex(TABLE).where({ slug, is_published: true }).first();
}

export async function incrementViewCount(id: number) {
  return masterKnex(TABLE).where({ id }).increment("view_count", 1);
}
