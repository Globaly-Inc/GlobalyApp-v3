import { masterKnex } from "../../../core/db/master-pool.js";
import { getKnex } from "../../../core/db/pool-manager.js";
import { SUPERADMIN_SCHEMA as S } from "../../superadmin/consts.js";
import { courseSlug, parseCourseIdFragment } from "../utils/slug.js";

const INSTITUTION_COLUMNS = [
  "ei.id", "ei.job_id", "ei.name as business_name", "ei.logo_url", "ei.description",
  "ei.city", "ei.country as country_name", "ei.website", "ei.email",
  "ei.phone", "ei.address", "ei.facebook_url", "ei.instagram_url", "ei.twitter_url", "ei.linkedin_url", "ei.youtube_url",
];

function overviewQuery(
  { country, city, search }: Omit<BusinessSearchFilters, "categorySlug">,
  sourceTypeCondition: string,
) {
  const q = masterKnex(`${S}.extraction_institution_overview as ei`)
    .whereRaw(
      `exists (
        select 1 from ${S}.extraction_jobs ej
        where ej.id = ei.job_id and ej.status = 'exported' and ${sourceTypeCondition}
      )`,
    );

  if (country) q.whereILike("ei.country", `%${country}%`);
  if (city) q.whereILike("ei.city", `%${city}%`);
  if (search) {
    q.where((b) => b.whereILike("ei.name", `%${search}%`).orWhereILike("ei.description", `%${search}%`));
  }
  return q;
}

function institutionsQuery(filters: Omit<BusinessSearchFilters, "categorySlug">) {
  return overviewQuery(filters, "ej.source_type is distinct from 'visa_service'");
}

export type VisaServiceFilters = Omit<BusinessSearchFilters, "categorySlug"> & { licensedOnly?: boolean };

function visaServiceProvidersQuery({ licensedOnly, ...rest }: VisaServiceFilters) {
  const q = overviewQuery(rest, "ej.source_type = 'visa_service'");
  if (licensedOnly) {
    q.whereRaw(
      `exists (select 1 from ${S}.extraction_visa_services evs where evs.job_id = ei.job_id and evs.registration_status = 'active')`,
    );
  }
  return q;
}

function withSlug<T extends { id: string; business_name: string }>(row: T) {
  return { ...row, slug: courseSlug(row.business_name, row.id) };
}

export async function listPublicInstitutions(filters: Omit<BusinessSearchFilters, "categorySlug">, limit: number, offset: number) {
  const rows = await institutionsQuery(filters)
    .select(
      "ei.id", "ei.name as business_name", "ei.logo_url", "ei.description", "ei.city", "ei.country as country_name",
      "ei.website", "ei.email",
      masterKnex.raw(
        `(select count(*) from ${S}.extraction_courses ec where ec.job_id = ei.job_id and ec.verification_status = 'confirmed') as course_count`,
      ),
    )
    .orderBy("ei.name")
    .limit(limit)
    .offset(offset);
  return rows.map((r: { id: string; business_name: string; course_count: string }) =>
    withSlug({ ...r, course_count: Number(r.course_count) }));
}

export async function countPublicInstitutions(filters: Omit<BusinessSearchFilters, "categorySlug">) {
  const [row] = await institutionsQuery(filters).count("ei.id as count");
  return Number(row.count);
}

export async function listPublicVisaServiceProviders(filters: VisaServiceFilters, limit: number, offset: number) {
  const rows = await visaServiceProvidersQuery(filters)
    .select(
      "ei.id", "ei.name as business_name", "ei.logo_url", "ei.description", "ei.city", "ei.country as country_name",
      "ei.website", "ei.email",
      masterKnex.raw(
        `(select count(*) from ${S}.extraction_visa_services evs where evs.job_id = ei.job_id) as service_count`,
      ),
    )
    .orderBy("ei.name")
    .limit(limit)
    .offset(offset);
  return rows.map((r: { id: string; business_name: string; service_count: string }) =>
    withSlug({ ...r, service_count: Number(r.service_count) }));
}

export async function countPublicVisaServiceProviders(filters: VisaServiceFilters) {
  const [row] = await visaServiceProvidersQuery(filters).count("ei.id as count");
  return Number(row.count);
}

export async function findPublicInstitutionBySlug(slug: string) {
  const fragment = parseCourseIdFragment(slug);
  if (!fragment) return null;

  const institution = await institutionsQuery({})
    .whereRaw("left(replace(ei.id::text, '-', ''), 6) = ?", [fragment])
    .select(...INSTITUTION_COLUMNS)
    .first();
  if (!institution) return null;

  return withSlug(institution);
}

export type BusinessSearchFilters = {
  categorySlug: string;
  country?: string;
  city?: string;
  search?: string;
};

const BUSINESS_COLUMNS = [
  "b.id", "b.business_name", "b.subdomain", "b.schema_name", "b.logo_url", "b.cover_url", "b.description",
  "b.city", "c.name as country_name", "b.website", "b.email",
  "b.phone", "b.address", "cat.name as category_name",
  "b.facebook_url", "b.instagram_url", "b.twitter_url", "b.linkedin_url", "b.youtube_url",
];

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
  const rows = await baseQuery(filters)
    .select(
      "b.id", "b.business_name", "b.subdomain", "b.schema_name", "b.logo_url", "b.description",
      "b.city", "c.name as country_name",
      "b.website", "b.email",
    )
    .orderBy("b.business_name")
    .limit(limit)
    .offset(offset);

  type ListRow = {
    id: number; business_name: string; subdomain: string; schema_name: string; logo_url: string | null;
    description: string | null; city: string | null; country_name: string | null; website: string | null; email: string | null;
  };
  return Promise.all(rows.map(async ({ schema_name, ...row }: ListRow) => {
    const db = await getKnex(row.id, schema_name);
    const [[{ count: service_count }], [{ count: location_count }]] = await Promise.all([
      db("business_services").whereNull("deleted_at").where("is_published", true).count("id as count"),
      db("business_branches").whereNull("deleted_at").count("id as count"),
    ]);
    return { ...row, service_count: Number(service_count), location_count: Number(location_count) };
  }));
}

export async function countPublicBusinesses(filters: BusinessSearchFilters) {
  const [row] = await baseQuery(filters).count("b.id as count");
  return Number(row.count);
}

export async function findPublicBusinessBySubdomain(subdomain: string) {
  const business = await masterKnex("businesses as b")
    .join("business_categories as cat", "cat.id", "b.business_category_id")
    .leftJoin("countries as c", "c.id", "b.country_id")
    .where("b.is_published", true)
    .whereNull("b.deleted_at")
    .where("b.subdomain", subdomain)
    .select(...BUSINESS_COLUMNS)
    .first();
  return business ?? null;
}

// ── Public profile sections: branches, team, services, represented partners ──
// Branches/members/services live in the business's own tenant schema
// (businesses.schema_name); representations are a public-schema table.

export async function listPublicBranches(businessId: number, schemaName: string) {
  const db = await getKnex(businessId, schemaName);
  return db("business_branches")
    .whereNull("deleted_at")
    .select("uuid as id", "name", "country", "state", "city", "address", "phone", "email", "is_primary", "branch_type")
    .orderBy("is_primary", "desc")
    .orderBy("name");
}

export async function listPublicMembers(businessId: number, schemaName: string) {
  const db = await getKnex(businessId, schemaName);
  return db("agents as a")
    .join("roles as r", "r.id", "a.role_id")
    .whereNull("a.deleted_at")
    .where("a.account_status", 1)
    .select(
      "a.id", "a.first_name", "a.last_name", "a.is_owner", "a.admin_point_of_contact",
      "r.display_name as role_display",
    )
    .orderBy("a.is_owner", "desc")
    .orderBy("a.first_name");
}

export async function listPublicServices(businessId: number, schemaName: string) {
  const db = await getKnex(businessId, schemaName);
  return db("business_services")
    .whereNull("deleted_at")
    .where("is_published", true)
    .select("uuid as id", "name", "description", "price")
    .orderBy("name");
}

export async function listPublicRepresentations(businessId: number) {
  return masterKnex("business_representations")
    .whereNull("deleted_at")
    .where("business_id", businessId)
    .where("status", "active")
    .select("uuid as id", "partner_business_id", "partner_business_name", "partner_business_logo_url", "relation_type")
    .orderBy("partner_business_name");
}
