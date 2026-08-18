// Public org profiles and the SEO inventory behind them (Wave C2b).
//
// WHAT AN ORG IS
// A public directory listing is polymorphic, exactly as catalog_services says:
// either a `businesses` row (claimed, owner-run, tenant-provisioned) or an
// `institutions` row (unclaimed — V3 split these out of V1's single `businesses`
// table precisely so a listing can exist before anybody owns it). One profile
// endpoint therefore resolves across both, and the slug carries which table it
// came from so the lookup is an index seek either way.
//
// WHAT AN AGENT IS
// The same thing. V1 discriminated with `businesses.business_type in
// ('institution','agent',...)`; V2 dropped the enum in favour of
// `business_categories.slug` and scoped GET /agents/:slug to `education_agency`.
// V3 follows V2 — the category is the discriminator. `extraction_agents` and the
// per-tenant `agents` table are unrelated: the first is scraper configuration,
// the second is staff-with-roles. Neither is ever public.
//
// PUBLICATION
// Businesses are gated on is_published, matching V1's businesses_public view and
// V3's own /search/institutions. Institutions are not: an unclaimed listing is
// unpublished by definition and showing it is the entire reason the directory
// exists. Services on either are always gated by liveScope().

import type { Knex } from "knex";

import { masterKnex } from "../../../core/db/master-pool.js";
import { baseQuery, liveScope } from "./catalog.repository.js";

/** business_categories.slug → the profile path the org is served under. */
const KIND_BY_CATEGORY: Record<string, OrgKind> = {
  institutions: "institution",
  education_agency: "agent",
  migration_agents: "agent",
};

export type OrgKind = "institution" | "agent";

export function kindForCategory(categorySlug: string | null): OrgKind | null {
  return categorySlug ? (KIND_BY_CATEGORY[categorySlug] ?? null) : null;
}

/**
 * Columns a visitor may see. Modelled on V1's `businesses_public` view, which is
 * the only place either legacy system wrote down what is safe to expose. Absent
 * on purpose: schema_name, owner_id/platform_user_id, subdomain, account_status,
 * onboarding/T&C flags, every Stripe id, meta, and the registration/licence
 * fields V1's view also stripped.
 */
const PUBLIC_COLUMNS = `
  o.id,
  o.slug,
  o.name,
  o.type,
  o.description,
  o.logo_url,
  o.cover_url,
  o.gallery_images,
  o.video_urls,
  o.website,
  o.email,
  o.phone,
  o.state,
  o.city,
  o.address,
  o.postcode,
  o.linkedin_url,
  o.facebook_url,
  o.instagram_url,
  o.twitter_url,
  o.youtube_url,
  o.whatsapp_url,
  o.claim_status,
  o.created_at,
  o.updated_at,
  o.org_type,
  o.category_id,
  o.category_name,
  o.category_slug,
  o.country_id,
  o.country_name,
  o.country_iso2,
  o.country_slug,
  (o.status = 'verified' or o.verified_at is not null) as is_verified
`;

/**
 * Both org tables projected onto one row shape. Kept as a CTE rather than two
 * queries so a slug lookup, a sitemap page and a kind check all read the same
 * definition of "an org the public may open".
 */
const ORGS_CTE = `
  with orgs as (
    select
      'business'::text as org_type,
      b.id, b.slug, b.business_name as name, b.business_type as type,
      b.description, b.logo_url, b.cover_url, b.gallery_images, b.video_urls,
      b.website, b.email, b.phone, b.state, b.city, b.address, b.postcode,
      b.linkedin_url, b.facebook_url, b.instagram_url, b.twitter_url, b.youtube_url, b.whatsapp_url,
      b.status, b.verified_at, null::text as claim_status,
      b.created_at, b.updated_at,
      cat.id as category_id, cat.name as category_name, cat.slug as category_slug,
      c.id as country_id, c.name as country_name, c.iso2 as country_iso2, c.slug as country_slug
    from businesses b
    left join business_categories cat on cat.id = b.business_category_id
    left join countries c on c.id = b.country_id
    where b.deleted_at is null and b.is_published = true and b.slug is not null

    union all

    select
      'institution'::text,
      i.id, i.slug, i.institution_name, i.institution_type,
      i.description, i.logo_url, i.cover_url, i.gallery_images, i.video_urls,
      i.website, i.email, i.phone, i.state, i.city, i.address, i.postcode,
      i.linkedin_url, i.facebook_url, i.instagram_url, i.twitter_url, i.youtube_url, i.whatsapp_url,
      i.status, i.verified_at, i.claim_status,
      i.created_at, i.updated_at,
      null::integer, null::text, 'institutions'::text,
      c.id, c.name, c.iso2, c.slug
    from institutions i
    left join countries c on c.id = i.country_id
    where i.deleted_at is null and i.slug is not null
  )
`;

export interface OrgRow extends Record<string, unknown> {
  id: number;
  slug: string;
  name: string;
  org_type: "business" | "institution";
  category_slug: string | null;
}

/** One org by its public slug, or undefined. The caller checks the kind. */
export async function findOrgBySlug(slug: string, db: Knex = masterKnex): Promise<OrgRow | undefined> {
  const { rows } = await db.raw(`${ORGS_CTE} select ${PUBLIC_COLUMNS} from orgs o where o.slug = ? limit 1`, [
    slug,
  ]);
  return rows[0] as OrgRow | undefined;
}

export interface SitemapRow {
  slug: string;
  path_slug?: string;
  lastmod: Date | string | null;
}

/**
 * Orgs of one kind, slug + lastmod only, for the sitemap. Ordered by slug so
 * paging is stable across requests — a sitemap that reshuffles between pages
 * silently drops URLs.
 */
export async function listOrgSlugs(
  kinds: OrgKind[],
  limit: number,
  offset: number,
  db: Knex = masterKnex,
): Promise<{ rows: SitemapRow[]; total: number }> {
  const categories = Object.entries(KIND_BY_CATEGORY)
    .filter(([, kind]) => kinds.includes(kind))
    .map(([category]) => category);

  const where = "o.category_slug = any(?)";
  const [{ rows }, { rows: counted }] = await Promise.all([
    db.raw(
      `${ORGS_CTE}
       select o.slug, o.updated_at as lastmod from orgs o where ${where} order by o.slug limit ? offset ?`,
      [categories, limit, offset],
    ),
    db.raw(`${ORGS_CTE} select count(*)::int as total from orgs o where ${where}`, [categories]),
  ]);

  return { rows, total: counted[0].total as number };
}

/**
 * Live services for the sitemap. Goes through liveScope() like every other public
 * read, so an unpublished or soft-deleted service can never be advertised to a
 * crawler.
 */
export async function listServiceSitemapRows(limit: number, offset: number) {
  const rows = await liveScope(baseQuery())
    .select("catalog_services.service_id", "catalog_services.name", "catalog_services.updated_at as lastmod")
    .orderBy("catalog_services.service_id")
    .limit(limit)
    .offset(offset);

  const [{ count }] = await liveScope(baseQuery()).count({ count: "catalog_services.service_id" });
  return { rows, total: Number(count) };
}

export async function listCountrySitemapRows(limit: number, offset: number, db: Knex = masterKnex) {
  const scope = () => db("countries").whereNull("deleted_at").where("is_active", true).whereNotNull("slug");
  const rows = await scope().select("slug", "updated_at as lastmod").orderBy("slug").limit(limit).offset(offset);
  const [{ count }] = await scope().count({ count: "id" });
  return { rows, total: Number(count) };
}

export async function listCitySitemapRows(limit: number, offset: number, db: Knex = masterKnex) {
  const scope = () =>
    db("cities as ct")
      .join("countries as c", "c.id", "ct.country_id")
      .whereNull("ct.deleted_at")
      .whereNull("c.deleted_at")
      .whereNotNull("ct.slug")
      .whereNotNull("c.slug");

  const rows = await scope()
    .select("ct.slug", "c.slug as country_slug", "ct.updated_at as lastmod")
    .orderBy(["c.slug", "ct.slug"])
    .limit(limit)
    .offset(offset);
  const [{ count }] = await scope().count({ count: "ct.id" });
  return { rows, total: Number(count) };
}
