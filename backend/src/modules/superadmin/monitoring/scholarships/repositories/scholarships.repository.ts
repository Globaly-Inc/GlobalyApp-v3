// Scholarships repository — admin-managed content (see categories/countries for the same pattern).

import { masterKnex } from "../../../../../core/db/master-pool.js";

const TABLE = "scholarships";
const now = () => masterKnex.fn.now();

type AdminFilters = {
  search?: string; is_published?: boolean; is_featured?: boolean; country?: string;
  coverage_min?: number; coverage_max?: number; deadline_from?: string; deadline_to?: string;
};
type PublicFilters = {
  q?: string; country?: string; basis?: string; coverage_type?: string;
  degree_level?: string; coverage_min?: number;
};

function applyAdminFilters(q: ReturnType<typeof masterKnex>, filters: AdminFilters) {
  if (filters.search) {
    q.where((b) => b.whereILike("title", `%${filters.search}%`).orWhereILike("provider_name", `%${filters.search}%`));
  }
  if (filters.is_published !== undefined) q.where({ is_published: filters.is_published });
  if (filters.is_featured !== undefined) q.where({ is_featured: filters.is_featured });
  if (filters.country) q.where({ country: filters.country });
  if (filters.coverage_min !== undefined) q.where("coverage_amount", ">=", filters.coverage_min);
  if (filters.coverage_max !== undefined) q.where("coverage_amount", "<=", filters.coverage_max);
  if (filters.deadline_from) q.where("deadline", ">=", filters.deadline_from);
  if (filters.deadline_to) q.where("deadline", "<=", filters.deadline_to);
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
  if (filters.basis) q.where({ basis: filters.basis });
  if (filters.coverage_type) q.where({ coverage_type: filters.coverage_type });
  if (filters.degree_level) q.whereRaw("? = ANY(degree_levels)", [filters.degree_level]);
  if (filters.coverage_min !== undefined) q.where("coverage_amount", ">=", filters.coverage_min);
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
