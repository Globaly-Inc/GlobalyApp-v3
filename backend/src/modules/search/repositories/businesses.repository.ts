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
  { country, city, search }: Omit<BusinessSearchFilters, "businessType">,
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

function institutionsQuery(filters: Omit<BusinessSearchFilters, "businessType">) {
  return overviewQuery(filters, "ej.source_type is distinct from 'visa_service'");
}

export type VisaServiceFilters = Omit<BusinessSearchFilters, "businessType"> & { licensedOnly?: boolean };

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

/** A real business's integer id, padded to the 6-hex-char fragment `courseSlug`/`parseCourseIdFragment` expect. */
function businessIdFragment(id: number): string {
  return String(id).padStart(6, "0");
}

/**
 * Real, published businesses filed under the "institutions" category — distinct from the scraped
 * `extraction_institution_overview` catalog above. Shown first: they are current, owner-maintained data,
 * while the scrape fills in the catalog until more businesses register.
 */
function realInstitutionsQuery(filters: Omit<BusinessSearchFilters, "businessType">) {
  return baseQuery({ businessType: "institution", ...filters });
}

async function listRealInstitutions(filters: Omit<BusinessSearchFilters, "businessType">) {
  const rows = await realInstitutionsQuery(filters)
    .select("b.id", "b.business_name", "b.logo_url", "b.description", "b.city", "c.name as country_name", "b.website", "b.email")
    .orderBy("b.business_name");
  return rows.map((r: { id: number; business_name: string }) =>
    withSlug({ ...r, id: businessIdFragment(r.id), course_count: 0 }));
}

async function countRealInstitutions(filters: Omit<BusinessSearchFilters, "businessType">) {
  const [row] = await realInstitutionsQuery(filters).count("b.id as count");
  return Number(row.count);
}

export async function listPublicInstitutions(filters: Omit<BusinessSearchFilters, "businessType">, limit: number, offset: number) {
  // ponytail: real businesses are fetched in full (not offset/limited at the SQL level) and prepended —
  // institution counts are small today, so this keeps cross-source page math simple. Revisit with a proper
  // merged/paginated query if the number of published institution businesses grows large.
  const real = await listRealInstitutions(filters);
  const page = real.slice(offset, offset + limit);
  const remaining = limit - page.length;
  if (remaining <= 0) return page;

  const extractionOffset = Math.max(offset - real.length, 0);
  const extractionRows = await institutionsQuery(filters)
    .select(
      "ei.id", "ei.name as business_name", "ei.logo_url", "ei.description", "ei.city", "ei.country as country_name",
      "ei.website", "ei.email",
      masterKnex.raw(
        `(select count(*) from ${S}.extraction_courses ec where ec.job_id = ei.job_id and ec.verification_status = 'confirmed') as course_count`,
      ),
    )
    .orderBy("ei.name")
    .limit(remaining)
    .offset(extractionOffset);
  return [
    ...page,
    ...extractionRows.map((r: { id: string; business_name: string; course_count: string }) =>
      withSlug({ ...r, course_count: Number(r.course_count) })),
  ];
}

export async function countPublicInstitutions(filters: Omit<BusinessSearchFilters, "businessType">) {
  const [[row], realCount] = await Promise.all([
    institutionsQuery(filters).count("ei.id as count"),
    countRealInstitutions(filters),
  ]);
  return Number(row.count) + realCount;
}

/**
 * Real, published businesses that offer at least one published service filed under a
 * "Visa"-named service category — distinct from the scraped visa_service extraction catalog
 * above. Shown first, same reasoning as listRealInstitutions.
 * ponytail: one tenant-schema query per published business (services live per-tenant, so there's
 * no single cross-tenant join). Fine while business counts are small; revisit if this gets slow.
 */
type RealVisaBusinessRow = {
  id: number; business_name: string; subdomain: string; schema_name: string; logo_url: string | null;
  description: string | null; city: string | null; country_name: string | null; website: string | null; email: string | null;
};

async function listRealVisaProviders({ country, city, search }: Omit<VisaServiceFilters, "licensedOnly">) {
  const businesses: RealVisaBusinessRow[] = await masterKnex("businesses as b")
    .leftJoin("countries as c", "c.id", "b.country_id")
    .where("b.is_published", true)
    .whereNull("b.deleted_at")
    .select("b.id", "b.business_name", "b.subdomain", "b.schema_name", "b.logo_url", "b.description", "b.city", "c.name as country_name", "b.website", "b.email");

  const matches = await Promise.all(
    businesses.map(async (b) => {
      const db = await getKnex(b.id, b.schema_name);
      const [{ count }] = await db("business_services as s")
        .leftJoin("service_categories as cat", "cat.id", "s.service_category_id")
        .whereNull("s.deleted_at")
        .where("s.is_published", true)
        .whereILike("cat.name", "%visa%")
        .count("s.id as count");
      return Number(count) > 0 ? b : null;
    }),
  );

  let rows = matches.filter((b): b is RealVisaBusinessRow => b !== null);
  if (country) rows = rows.filter((b) => b.country_name?.toLowerCase() === country.toLowerCase());
  if (city) rows = rows.filter((b) => b.city?.toLowerCase().includes(city.toLowerCase()));
  if (search) {
    const q = search.toLowerCase();
    rows = rows.filter((b) => b.business_name.toLowerCase().includes(q) || b.description?.toLowerCase().includes(q));
  }
  return rows
    .map(({ schema_name, ...b }) => withSlug({ ...b, id: businessIdFragment(b.id), service_count: 0 }))
    .sort((a, b) => a.business_name.localeCompare(b.business_name));
}

export async function listPublicVisaServiceProviders(filters: VisaServiceFilters, limit: number, offset: number) {
  const real = await listRealVisaProviders(filters);
  const page = real.slice(offset, offset + limit);
  const remaining = limit - page.length;
  if (remaining <= 0) return page;

  const extractionOffset = Math.max(offset - real.length, 0);
  const extractionRows = await visaServiceProvidersQuery(filters)
    .select(
      "ei.id", "ei.name as business_name", "ei.logo_url", "ei.description", "ei.city", "ei.country as country_name",
      "ei.website", "ei.email",
      masterKnex.raw(
        `(select count(*) from ${S}.extraction_visa_services evs where evs.job_id = ei.job_id) as service_count`,
      ),
    )
    .orderBy("ei.name")
    .limit(remaining)
    .offset(extractionOffset);
  return [
    ...page,
    ...extractionRows.map((r: { id: string; business_name: string; service_count: string }) =>
      withSlug({ ...r, service_count: Number(r.service_count) })),
  ];
}

export async function countPublicVisaServiceProviders(filters: VisaServiceFilters) {
  const [[row], real] = await Promise.all([
    visaServiceProvidersQuery(filters).count("ei.id as count"),
    listRealVisaProviders(filters),
  ]);
  return Number(row.count) + real.length;
}

export async function findPublicInstitutionBySlug(slug: string) {
  const fragment = parseCourseIdFragment(slug);
  if (!fragment) return null;

  // Real businesses first (see listPublicInstitutions) — their fragment is the id itself, zero-padded.
  const real = await realInstitutionsQuery({})
    .whereRaw("lpad(b.id::text, 6, '0') = ?", [fragment])
    .select(...BUSINESS_COLUMNS)
    .first();
  if (real) return withSlug({ ...real, id: businessIdFragment(real.id), job_id: null });

  const institution = await institutionsQuery({})
    .whereRaw("left(replace(ei.id::text, '-', ''), 6) = ?", [fragment])
    .select(...INSTITUTION_COLUMNS)
    .first();
  if (!institution) return null;

  return withSlug(institution);
}

export type BusinessSearchFilters = {
  // The signup-time `business_type` (agent/institution/service_provider/...) — not
  // `business_category_id`, which is a separate, optionally-set field the owner may never fill
  // in. Filtering search tabs by business_type means a business shows up as soon as it's
  // published, without also requiring a manual category pick.
  businessType: string;
  country?: string;
  city?: string;
  search?: string;
};

const BUSINESS_COLUMNS = [
  "b.id", "b.business_name", "b.subdomain", "b.schema_name", "b.logo_url", "b.cover_url", "b.description",
  "b.city", "c.name as country_name", "b.website", "b.email",
  "b.phone", "b.address", "cat.name as category_name", "b.public_visibility",
  "b.facebook_url", "b.instagram_url", "b.twitter_url", "b.linkedin_url", "b.youtube_url",
];

function baseQuery({ businessType, country, city, search }: BusinessSearchFilters) {
  const q = masterKnex("businesses as b")
    .leftJoin("business_categories as cat", "cat.id", "b.business_category_id")
    .leftJoin("countries as c", "c.id", "b.country_id")
    .where("b.business_type", businessType)
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
      "b.city", "c.name as country_name", "b.status", "cat.name as category_name",
      "b.website", "b.email",
    )
    .orderBy("b.business_name")
    .limit(limit)
    .offset(offset);

  type ListRow = {
    id: number; business_name: string; subdomain: string; schema_name: string; logo_url: string | null;
    description: string | null; city: string | null; country_name: string | null; status: string; category_name: string | null;
    website: string | null; email: string | null;
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
    .leftJoin("business_categories as cat", "cat.id", "b.business_category_id")
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

type PublicServiceRow = {
  id: string; name: string; description: string | null; price: string | null; category_name: string | null;
  business_id: number; business_name: string; business_subdomain: string; logo_url: string | null;
};

/**
 * Published services across every published business — services live in each business's own tenant
 * schema, so this is an N+1 fan-out (one tenant query per business), same pattern as the service_count
 * lookup in listPublicBusinesses. Filtering/pagination happens in memory after the fan-out.
 * ponytail: fine while the business count is small; move to a synced read table if this gets slow.
 */
export async function listPublicServicesAcrossBusinesses(
  filters: { search?: string; category?: string },
): Promise<PublicServiceRow[]> {
  const businesses = await masterKnex("businesses as b")
    .where("b.is_published", true)
    .whereNull("b.deleted_at")
    .select("b.id", "b.business_name", "b.subdomain", "b.schema_name", "b.logo_url");

  const perBusiness = await Promise.all(
    businesses.map(async (b: { id: number; business_name: string; subdomain: string; schema_name: string; logo_url: string | null }) => {
      const db = await getKnex(b.id, b.schema_name);
      const q = db("business_services as s")
        .leftJoin("service_categories as cat", "cat.id", "s.service_category_id")
        .whereNull("s.deleted_at")
        .where("s.is_published", true);
      if (filters.search) {
        q.where((w) => w.whereILike("s.name", `%${filters.search}%`).orWhereILike("s.description", `%${filters.search}%`));
      }
      if (filters.category) q.whereILike("cat.name", `%${filters.category}%`);
      const rows = await q.select("s.uuid as id", "s.name", "s.description", "s.price", "cat.name as category_name");
      return rows.map((r: { id: string; name: string; description: string | null; price: string | null; category_name: string | null }) => ({
        ...r, business_id: b.id, business_name: b.business_name, business_subdomain: b.subdomain, logo_url: b.logo_url,
      }));
    }),
  );

  return perBusiness.flat().sort((a, b) => a.name.localeCompare(b.name));
}

export async function listPublicRepresentations(businessId: number) {
  return masterKnex("business_representations")
    .whereNull("deleted_at")
    .where("business_id", businessId)
    .where("status", "active")
    .select("uuid as id", "partner_business_id", "partner_business_name", "partner_business_logo_url", "relation_type")
    .orderBy("partner_business_name");
}
