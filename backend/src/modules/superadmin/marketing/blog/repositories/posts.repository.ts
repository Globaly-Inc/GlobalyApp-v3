import { masterKnex } from "../../../../../core/db/master-pool.js";

const now = () => masterKnex.fn.now();
const TABLE = "superadmin.blog_posts";

type PostFilters = { search?: string; category?: string; is_published?: boolean };

export async function listPosts(limit: number, offset: number, filters: PostFilters) {
  const q = masterKnex(TABLE).whereNull("deleted_at").orderBy("created_at", "desc").limit(limit).offset(offset);
  if (filters.search) q.whereILike("title", `%${filters.search}%`);
  if (filters.category) q.where({ category: filters.category });
  if (filters.is_published !== undefined) q.where({ is_published: filters.is_published });
  return q;
}

export async function countPosts(filters: PostFilters) {
  const q = masterKnex(TABLE).whereNull("deleted_at").count("* as count");
  if (filters.search) q.whereILike("title", `%${filters.search}%`);
  if (filters.category) q.where({ category: filters.category });
  if (filters.is_published !== undefined) q.where({ is_published: filters.is_published });
  const [row] = await q;
  return Number(row.count);
}

export async function findPostById(id: number) {
  return masterKnex(TABLE).where({ id }).whereNull("deleted_at").first();
}

export async function findPostBySlug(slug: string, excludeId?: number) {
  const q = masterKnex(TABLE).where({ slug }).whereNull("deleted_at");
  if (excludeId) q.whereNot({ id: excludeId });
  return q.first();
}

// pg serializes plain JS arrays as Postgres array literals, not JSON — stringify explicitly for the jsonb column.
const serializeTags = (data: Record<string, unknown>) =>
  "tags" in data ? { ...data, tags: data.tags == null ? null : JSON.stringify(data.tags) } : data;

export async function insertPost(data: Record<string, unknown>) {
  const [row] = await masterKnex(TABLE).insert(serializeTags(data)).returning("*");
  return row;
}

export async function updatePost(id: number, data: Record<string, unknown>) {
  const [row] = await masterKnex(TABLE).where({ id }).update({ ...serializeTags(data), updated_at: now() }).returning("*");
  return row;
}

export async function deletePost(id: number) {
  return masterKnex(TABLE).where({ id }).update({ deleted_at: now() });
}

// ─── Public reads (is_published = true only) ──────────────────────────────

type PublicPostFilters = { category?: string; country_focus?: string };

export async function listPublishedPosts(limit: number, offset: number, filters: PublicPostFilters) {
  const q = masterKnex(TABLE).whereNull("deleted_at").where({ is_published: true })
    .orderBy("published_at", "desc").limit(limit).offset(offset);
  if (filters.category) q.where({ category: filters.category });
  if (filters.country_focus) q.where({ country_focus: filters.country_focus });
  return q;
}

export async function countPublishedPosts(filters: PublicPostFilters) {
  const q = masterKnex(TABLE).whereNull("deleted_at").where({ is_published: true }).count("* as count");
  if (filters.category) q.where({ category: filters.category });
  if (filters.country_focus) q.where({ country_focus: filters.country_focus });
  const [row] = await q;
  return Number(row.count);
}

export async function findPublishedPostById(id: number) {
  return masterKnex(TABLE).where({ id, is_published: true }).whereNull("deleted_at").first();
}

export async function incrementViews(id: number) {
  return masterKnex(TABLE).where({ id }).increment("views", 1);
}

// Distinct filter values across published posts — drives the public blog's filter
// pills so they always reflect what's actually there, instead of a hardcoded guess-list.
export async function listPublishedFilterValues() {
  const [categories, countries] = await Promise.all([
    masterKnex(TABLE).where({ is_published: true }).whereNull("deleted_at").whereNotNull("category")
      .distinct("category").orderBy("category"),
    masterKnex(TABLE).where({ is_published: true }).whereNull("deleted_at").whereNotNull("country_focus")
      .distinct("country_focus").orderBy("country_focus"),
  ]);
  return {
    categories: categories.map((r) => r.category as string),
    countries: countries.map((r) => r.country_focus as string),
  };
}
