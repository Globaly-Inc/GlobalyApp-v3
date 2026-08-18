import { masterKnex } from "../../../core/db/master-pool.js";

export type BusinessSearchFilters = {
  categorySlug: string;
  country?: string;
  city?: string;
  search?: string;
};

function baseQuery({ categorySlug, country, city, search }: BusinessSearchFilters) {
  const q = masterKnex("businesses as b")
    .join("business_categories as cat", "cat.id", "b.business_category_id")
    .leftJoin("countries as c", "c.id", "b.country_id")
    .where("cat.slug", categorySlug)
    .where("b.is_published", true)
    .whereNull("b.deleted_at");

  if (country) {
    q.where((b) =>
      b.whereRaw("lower(c.name) = lower(?)", [country]).orWhereRaw("lower(c.slug) = lower(?)", [country]),
    );
  }
  if (city) q.whereILike("b.city", `%${city}%`);
  if (search) {
    q.where((b) => b.whereILike("b.business_name", `%${search}%`).orWhereILike("b.description", `%${search}%`));
  }
  return q;
}

export async function listPublicBusinesses(filters: BusinessSearchFilters, limit: number, offset: number) {
  return baseQuery(filters)
    .select(
      // b.slug is the public profile slug (20260817_004_org_slugs) — the only
      // thing that lets a directory card link to /institutions/{slug}.
      "b.id", "b.slug", "b.business_name", "b.subdomain", "b.logo_url", "b.description",
      "b.city", "c.name as country_name",
      "b.website", "b.email",
    )
    .orderBy("b.business_name")
    .limit(limit)
    .offset(offset);
}

export async function countPublicBusinesses(filters: BusinessSearchFilters) {
  const [row] = await baseQuery(filters).count("b.id as count");
  return Number(row.count);
}
