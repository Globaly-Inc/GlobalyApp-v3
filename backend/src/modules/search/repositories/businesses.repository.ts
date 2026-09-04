import { masterKnex } from "../../../core/db/master-pool.js";
import { getKnex } from "../../../core/db/pool-manager.js";
import { SUPERADMIN_SCHEMA as S } from "../../superadmin/consts.js";
import { COURSE_INTAKES, NOT_REJECTED } from "./courses.repository.js";
import { courseSlug, parseCourseIdFragment } from "../utils/slug.js";

// The public catalog row shape the institution detail page expects — `job_id` (from
// source_job_id) is what the /courses endpoint uses to find the scraped course catalog.
/**
 * The institution's crest. Promote copies the scraped logo into `institutions.logo_url`, but a
 * job re-scraped or enriched after that leaves the copy stale or null — falling back to the
 * extraction overview keeps the public pages on the authentic scraped crest.
 *
 * A correlated subquery rather than a join: `extraction_institution_overview` has no unique
 * index on job_id, so joining it could fan one institution out into several rows.
 */
const INSTITUTION_CREST = masterKnex.raw(
  `coalesce(i.logo_url, (select ei.logo_url from ${S}.extraction_institution_overview ei
      where ei.job_id = i.source_job_id and ei.logo_url is not null limit 1)) as logo_url`,
);

const INSTITUTION_COLUMNS = [
  "i.id", "i.source_job_id as job_id", "i.institution_name as business_name", INSTITUTION_CREST, "i.cover_url", "i.description",
  "i.city", "i.state", "i.postcode", "c.name as country_name", "i.website", "i.email",
  "i.phone", "i.address", "i.facebook_url", "i.instagram_url", "i.twitter_url", "i.linkedin_url", "i.youtube_url",
  // Header/sidebar fields the shared entity profile renders: the Verified badge, the category
  // label and the Registration & Licenses card (see EntityProfile on the frontend).
  "i.status", "i.institution_type as category_name", "i.registration_number", "i.registration_licenses",
  // Profile-page extras: the media strips and the "Other Information" sidebar rows.
  "i.gallery_images", "i.video_urls", "i.company_size", "i.created_at",
];

/**
 * Campuses of a promoted institution. They hang off the extraction job, so an institution
 * registered by hand (no source_job_id) has none and the page falls back to its own address.
 */
export async function listInstitutionCampuses(jobId: string) {
  return masterKnex(`${S}.extraction_campuses`)
    .where({ job_id: jobId })
    .select("id", "name", "address", "city", "state", "country", "phone", "email")
    .orderBy("created_at");
}

/**
 * The institution's team, read from the master-DB membership index rather than the tenant
 * `members` table — this public endpoint has no tenant connection to open.
 */
export async function listInstitutionMembers(institutionId: number) {
  return masterKnex("user_institution_index as ui")
    .join("platform_users as pu", "pu.id", "ui.platform_user_id")
    .where("ui.institution_id", institutionId)
    .whereNull("ui.deleted_at")
    .whereNull("pu.deleted_at")
    .select("pu.id", "pu.first_name", "pu.last_name", "pu.photo_url", "ui.role", "ui.is_owner")
    .orderBy([{ column: "ui.is_owner", order: "desc" }, { column: "pu.first_name" }]);
}

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

/**
 * The public institutions catalog — the `institutions` table (public schema), which is where
 * promote publishes extraction jobs and where owner-registered institutions live. Only rows
 * an admin has published are searchable, mirroring how `businesses.is_published` gates the
 * other tabs. Raw extraction rows are no longer served directly: an exported job becomes
 * visible by being promoted (→ institutions row) and published.
 */
export type InstitutionFilters = Omit<BusinessSearchFilters, "businessType"> & {
  institutionType?: string;
  /** "YYYY-MM" — keeps institutions whose catalog has an intake in that month or later. */
  intakeFrom?: string;
  /** The next three are catalog properties: an institution matches when one of its courses does. */
  subjectArea?: string;
  degreeLevel?: string;
  studyMode?: string;
};

/**
 * Keeps institutions whose catalog has a course matching `condition`.
 *
 * Subject area, degree level and study mode are course properties — an institution has them only
 * through what it teaches — so each is an EXISTS over its extraction job rather than a column here.
 */
/**
 * The three modes superadmin offers in the Study Options tab (STUDY_MODE_OPTIONS on the frontend).
 * Anything else is junk from a `creatable` combobox or an old scrape, and never reaches a card.
 */
const STUDY_MODES = ["on_campus", "online", "hybrid"] as const;

/**
 * An institution's study modes come from its courses' study OPTIONS — the rows an admin curates
 * per course — not from `extraction_courses.study_mode`, which is raw model output and regularly
 * holds a study *load* ("full_time") in the mode column. Same fragment behind the card, the
 * filter facets and the filter itself, so all three agree on what a mode is.
 */
const courseStudyModes = (courseScope: string) => `
  select distinct so.study_mode
    from ${S}.extraction_courses ec
    join ${S}.extraction_course_study_option_assignments a on a.course_id = ec.id
    join ${S}.extraction_study_options so on so.id = a.study_option_id
   where ${courseScope}
     and ${NOT_REJECTED}
     and so.study_mode in (${STUDY_MODES.map((m) => `'${m}'`).join(", ")})`;

function catalogMatch(condition: string, bindings: unknown[]) {
  return {
    sql: `exists (select 1 from ${S}.extraction_courses ec
                  where ec.job_id = i.source_job_id and ${NOT_REJECTED} and ${condition})`,
    bindings,
  };
}

function institutionsQuery({
  country, city, search, institutionType, intakeFrom, subjectArea, degreeLevel, studyMode,
}: InstitutionFilters) {
  const q = masterKnex("institutions as i")
    .leftJoin("countries as c", "c.id", "i.country_id")
    .where("i.is_published", true)
    .whereNull("i.deleted_at");

  if (country) {
    q.where((b) =>
      b.whereRaw("lower(c.name) = lower(?)", [country]).orWhereRaw("lower(c.slug) = lower(?)", [country]),
    );
  }
  if (city) q.whereILike("i.city", `%${city}%`);
  if (search) {
    q.where((b) => b.whereILike("i.institution_name", `%${search}%`).orWhereILike("i.description", `%${search}%`));
  }
  if (institutionType) q.whereRaw("lower(i.institution_type) = lower(?)", [institutionType]);
  if (intakeFrom) {
    // "Upcoming" reads as on-or-after the chosen month, not that month exactly — a picker that
    // only matched one month would return nothing for most institutions. A month-less intake
    // counts as January so a year-only row still lands in the right year.
    const [year, month] = intakeFrom.split("-").map(Number);
    q.whereRaw(
      `exists (
        select 1 from ${COURSE_INTAKES}
          join ${S}.extraction_courses ec on ec.id = ia.course_id
         where ec.job_id = i.source_job_id
           and ${NOT_REJECTED}
           and ei.intake_year is not null
           and (ei.intake_year > ? or (ei.intake_year = ? and coalesce(ei.intake_month, 1) >= ?))
      )`,
      [year, year, month],
    );
  }
  for (const match of [
    subjectArea && catalogMatch("ec.subject_area ilike ?", [`%${subjectArea}%`]),
    degreeLevel && catalogMatch("ec.degree_level = ?", [degreeLevel]),
    studyMode && {
      sql: `exists (${courseStudyModes("ec.job_id = i.source_job_id")} and so.study_mode = ?)`,
      bindings: [studyMode],
    },
  ]) {
    if (match) q.whereRaw(match.sql, match.bindings as never);
  }
  return q;
}

/**
 * The business category catalog, for the public hero search switcher.
 *
 * The authenticated lookup in businesses/lookups.routes.ts serves the same table to signed-in
 * business users; this one is read by anonymous visitors, so it is a deliberate column allow-list
 * rather than a row spread — no description, no ids, no timestamps.
 */
export async function listPublicBusinessCategories() {
  return masterKnex("business_categories")
    .where("is_active", true)
    .whereNull("deleted_at")
    .orderBy([{ column: "sort_order" }, { column: "name" }])
    .select("slug", "name", "icon");
}

/** Distinct institution types actually present in the catalog — the type filter's options. */
export async function listInstitutionTypes() {
  const rows = await masterKnex("institutions as i")
    .where("i.is_published", true)
    .whereNull("i.deleted_at")
    .whereNotNull("i.institution_type")
    .distinct("i.institution_type")
    .orderBy("i.institution_type");
  return rows.map((r: { institution_type: string }) => r.institution_type);
}

/**
 * Catalog facets for the institutions filter panel — the subject areas, degree levels and study
 * modes actually taught by a published institution, so no option can return an empty result.
 */
export async function listInstitutionCatalogFacets() {
  const published = `exists (select 1 from institutions i
                              where i.source_job_id = ec.job_id and i.is_published = true and i.deleted_at is null)`;
  const [{ rows }, modeRows] = await Promise.all([
    masterKnex.raw(
      `select distinct ec.subject_area, ec.degree_level
         from ${S}.extraction_courses ec
        where ${published} and ${NOT_REJECTED}`,
    ),
    masterKnex.raw(`${courseStudyModes(published)} order by so.study_mode`),
  ]);
  const column = (key: "subject_area" | "degree_level") =>
    [...new Set((rows as Record<string, string | null>[]).map((r) => r[key]).filter(Boolean))].sort() as string[];
  return {
    subject_areas: column("subject_area"),
    degree_levels: column("degree_level"),
    study_modes: (modeRows.rows as { study_mode: string }[]).map((r) => r.study_mode),
  };
}

/** Intake months across every published institution's catalog, earliest first — "YYYY-MM". */
export async function listInstitutionIntakeMonths() {
  const rows = await masterKnex.raw(
    `select distinct ei.intake_year, coalesce(ei.intake_month, 1) as intake_month
       from ${COURSE_INTAKES}
       join ${S}.extraction_courses ec on ec.id = ia.course_id
      where ei.intake_year is not null
        and ${NOT_REJECTED}
        and exists (select 1 from institutions i
                     where i.source_job_id = ec.job_id and i.is_published = true and i.deleted_at is null)
      order by 1, 2`,
  );
  return (rows.rows as { intake_year: number; intake_month: number }[]).map(
    (r) => `${r.intake_year}-${String(r.intake_month).padStart(2, "0")}`,
  );
}

/**
 * Courses of a promoted institution, via its source job — the same set the profile's course tab
 * lists (countPublicCourses). Not gated on `verification_status`: the public catalog isn't
 * either, so counting only 'confirmed' rows put a 0 on the card beside a profile full of courses.
 */
function institutionCourseCount() {
  return masterKnex.raw(
    `(select count(*) from ${S}.extraction_courses ec
      where ec.job_id = i.source_job_id and ${NOT_REJECTED}) as course_count`,
  );
}

// Card facts derived from the institution's own scraped catalog and campuses — all keyed off the
// same source job, so none of them needs a separate round trip per row.
const INSTITUTION_CARD_COLUMNS = [
  masterKnex.raw(
    `(select count(distinct ec.subject_area) from ${S}.extraction_courses ec
       where ec.job_id = i.source_job_id and ec.subject_area is not null
         and ${NOT_REJECTED}) as subject_area_count`,
  ),
  masterKnex.raw(
    `(select array_agg(study_mode order by study_mode)
        from (${courseStudyModes("ec.job_id = i.source_job_id")}) modes) as study_modes`,
  ),
  masterKnex.raw(
    `(select array_agg(distinct coalesce(cam.city, cam.state) order by coalesce(cam.city, cam.state))
        from ${S}.extraction_campuses cam
       where cam.job_id = i.source_job_id and coalesce(cam.city, cam.state) is not null) as campus_locations`,
  ),
];

type PublicInstitutionRow = {
  id: number;
  business_name: string;
  logo_url: string | null;
  course_count: string;
  subject_area_count: string;
  study_modes: string[] | null;
  campus_locations: string[] | null;
};

export type VisaServiceFilters = Omit<BusinessSearchFilters, "businessType"> & {
  licensedOnly?: boolean;
  /** Describes the services a provider offers, not the provider row itself. */
  serviceType?: string;
};

/**
 * A service superadmin discarded is a rejected row (visa-services.service.ts), so it must not be
 * listed, counted or filtered on publicly. 'pending' and 'approved' both stay visible — the
 * catalog would otherwise be empty, since a scraped service starts 'pending'.
 */
const VISIBLE_VISA_SERVICE = "coalesce(evs.status, 'pending') <> 'discarded'";

function visaServiceProvidersQuery({ licensedOnly, serviceType, ...rest }: VisaServiceFilters) {
  const q = overviewQuery(rest, "ej.source_type = 'visa_service'");
  // Both filters are properties of a service the provider offers, so each is an EXISTS over its job.
  const offers = (condition: string, bindings: unknown[] = []) =>
    q.whereRaw(
      `exists (select 1 from ${S}.extraction_visa_services evs
                where evs.job_id = ei.job_id and ${VISIBLE_VISA_SERVICE} and ${condition})`,
      bindings as never,
    );
  if (licensedOnly) offers("evs.registration_status = 'active'");
  if (serviceType) offers("evs.type = ?", [serviceType]);
  return q;
}

/**
 * Facets for the visa-services filter panel, read off the services themselves so no option can be
 * offered for something no visible provider actually does.
 */
export async function listVisaServiceFacets() {
  const rows = await masterKnex(`${S}.extraction_visa_services as evs`)
    .distinct("evs.type")
    .whereNotNull("evs.type")
    .whereRaw(VISIBLE_VISA_SERVICE)
    .whereRaw(
      `exists (select 1 from ${S}.extraction_jobs ej
                where ej.id = evs.job_id and ej.status = 'exported' and ej.source_type = 'visa_service')`,
    )
    .orderBy("evs.type");
  return { service_types: rows.map((r: { type: string }) => r.type) };
}

function withSlug<T extends { id: string; business_name: string }>(row: T) {
  return { ...row, slug: courseSlug(row.business_name, row.id) };
}

/** A real business's integer id, padded to the 6-hex-char fragment `courseSlug`/`parseCourseIdFragment` expect. */
function businessIdFragment(id: number): string {
  return String(id).padStart(6, "0");
}

const INSTITUTION_LIST_COLUMNS = [
  "i.id", "i.institution_name as business_name", INSTITUTION_CREST, "i.description",
  "i.city", "i.state", "c.name as country_name", "c.iso2 as country_code", "i.website", "i.email",
  // Verified tick and the Institution Type stat on the card.
  "i.status", "i.institution_type",
];

function toPublicInstitution(r: PublicInstitutionRow) {
  return withSlug({
    ...r,
    id: businessIdFragment(r.id),
    course_count: Number(r.course_count),
    subject_area_count: Number(r.subject_area_count),
    study_modes: r.study_modes ?? [],
    campus_locations: r.campus_locations ?? [],
  });
}

export async function listPublicInstitutions(filters: InstitutionFilters, limit: number, offset: number) {
  const rows = await institutionsQuery(filters)
    .select(...INSTITUTION_LIST_COLUMNS, institutionCourseCount(), ...INSTITUTION_CARD_COLUMNS)
    .orderBy("i.institution_name")
    .limit(limit)
    .offset(offset);
  return rows.map(toPublicInstitution);
}

/** The saved-items lookup: institutions are shortlisted by the padded id fragment the API exposes. */
export async function listPublicInstitutionsByFragments(fragments: string[]) {
  if (fragments.length === 0) return [];
  const rows = await institutionsQuery({})
    .whereRaw("lpad(i.id::text, 6, '0') = any(?)", [fragments])
    .select(...INSTITUTION_LIST_COLUMNS, institutionCourseCount(), ...INSTITUTION_CARD_COLUMNS)
    .orderBy("i.institution_name");
  return rows.map(toPublicInstitution);
}

export async function countPublicInstitutions(filters: InstitutionFilters) {
  const [row] = await institutionsQuery(filters).count("i.id as count");
  return Number(row.count);
}

/**
 * Real, published businesses that offer at least one published service filed under a
 * "Visa"-named service category — distinct from the scraped visa_service extraction catalog
 * above. Shown first: current, owner-maintained data ahead of the scraped catalog.
 * ponytail: one tenant-schema query per published business (services live per-tenant, so there's
 * no single cross-tenant join). Fine while business counts are small; revisit if this gets slow.
 */
type RealVisaBusinessRow = {
  id: number; business_name: string; subdomain: string; schema_name: string; logo_url: string | null;
  description: string | null; city: string | null; country_name: string | null; website: string | null; email: string | null;
};

/**
 * Owner-managed businesses that sell a visa service, which the tab lists alongside scraped providers.
 *
 * `licensedOnly` and `serviceType` describe columns that exist only on scraped services
 * (registration_status, type) — a business_services row carries neither, so there is no honest way
 * to evaluate them here. Rather than let these rows through unfiltered (which made the list, and
 * the total, contradict the active filter), a service-level filter excludes them entirely.
 */
async function listRealVisaProviders({ country, city, search, licensedOnly, serviceType }: VisaServiceFilters) {
  if (licensedOnly || serviceType) return [];

  const businesses: RealVisaBusinessRow[] = await masterKnex("businesses as b")
    .leftJoin("countries as c", "c.id", "b.country_id")
    .where("b.is_published", true)
    .whereNull("b.deleted_at")
    // No tenant schema → no services to match; also querying it would throw (see promote.service).
    .whereNotNull("b.schema_provisioned_at")
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
        `(select count(*) from ${S}.extraction_visa_services evs
           where evs.job_id = ei.job_id and ${VISIBLE_VISA_SERVICE}) as service_count`,
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

  // The fragment is the institution's integer id, zero-padded to the 6 chars the slug scheme expects.
  const institution = await institutionsQuery({})
    .whereRaw("lpad(i.id::text, 6, '0') = ?", [fragment])
    .select(...INSTITUTION_COLUMNS)
    .first();
  if (!institution) return null;

  return withSlug({ ...institution, id: businessIdFragment(institution.id) });
}

/**
 * A scraped visa-service provider's profile row. These live only in the extraction catalog (no
 * `businesses` row, so no subdomain) and are addressed by the same `{name}-{id-fragment}` slug
 * the search list emits through withSlug().
 */
export async function findPublicVisaServiceProviderBySlug(slug: string) {
  const fragment = parseCourseIdFragment(slug);
  if (!fragment) return null;

  const provider = await visaServiceProvidersQuery({})
    .whereRaw("left(replace(ei.id::text, '-', ''), 6) = ?", [fragment])
    .select(
      "ei.id", "ei.job_id", "ei.name as business_name", "ei.logo_url", "ei.description",
      "ei.address", "ei.city", "ei.state", "ei.country as country_name",
      "ei.website", "ei.email", "ei.phone", "ei.source_url",
      "ei.facebook_url", "ei.instagram_url", "ei.twitter_url", "ei.linkedin_url", "ei.youtube_url",
    )
    .first();
  if (!provider) return null;
  return withSlug(provider) as typeof provider & { slug: string };
}

/** The scraped visa services filed under a provider's extraction job. */
export async function listPublicVisaServicesForJob(jobId: string) {
  return masterKnex(`${S}.extraction_visa_services as evs`)
    .where("evs.job_id", jobId)
    .whereRaw(VISIBLE_VISA_SERVICE)
    .select(
      "evs.id", "evs.name", "evs.type", "evs.description",
      "evs.registration_number", "evs.registration_body",
      "evs.registration_status", "evs.registration_expiry",
      "evs.visa_types_handled", "evs.specializations", "evs.services_offered",
      "evs.languages_spoken", "evs.fee_amount", "evs.fee_currency", "evs.fee_type",
      "evs.fee_from", "evs.fee_to", "evs.consultation_fee", "evs.consultation_free",
      // Track record — the same figures the admin's service card shows.
      "evs.years_experience", "evs.team_size", "evs.success_rate",
      "evs.average_rating", "evs.review_count",
      "evs.countries_serviced", "evs.nationalities_serviced",
    )
    .orderBy("evs.name");
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
  /** Keeps only businesses an admin has verified — the "Verified" badge on the card. */
  verifiedOnly?: boolean;
};

const BUSINESS_COLUMNS = [
  "b.id", "b.business_name", "b.subdomain", "b.schema_name", "b.schema_provisioned_at", "b.logo_url", "b.cover_url", "b.description",
  "b.city", "b.state", "b.postcode", "c.name as country_name", "b.website", "b.email",
  "b.phone", "b.address", "cat.name as category_name", "b.public_visibility",
  "b.facebook_url", "b.instagram_url", "b.twitter_url", "b.linkedin_url", "b.youtube_url",
  // Header/sidebar fields the shared entity profile renders: the Verified badge, the Locations
  // map and the Registration & Licenses card (see EntityProfile on the frontend).
  "b.status", "b.latitude", "b.longitude", "b.business_registration_number", "b.registration_licenses",
  // Provenance: which scraped agent this listing was promoted from, for the branches fallback.
  "b.source_agent_id",
];

function baseQuery({ businessType, country, city, search, verifiedOnly }: BusinessSearchFilters) {
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
  if (verifiedOnly) q.where("b.status", "verified");
  return q;
}

export async function listPublicBusinesses(filters: BusinessSearchFilters, limit: number, offset: number) {
  const rows = await baseQuery(filters)
    .select(
      "b.id", "b.business_name", "b.subdomain", "b.schema_name", "b.schema_provisioned_at", "b.logo_url", "b.description",
      "b.city", "c.name as country_name", "b.status", "cat.name as category_name",
      "b.website", "b.email",
    )
    .orderBy("b.business_name")
    .limit(limit)
    .offset(offset);

  type ListRow = {
    id: number; business_name: string; subdomain: string; schema_name: string; schema_provisioned_at: Date | null;
    logo_url: string | null; description: string | null; city: string | null; country_name: string | null;
    status: string; category_name: string | null; website: string | null; email: string | null;
  };
  return Promise.all(rows.map(async ({ schema_name, schema_provisioned_at, ...row }: ListRow) => {
    // Promoted-but-unclaimed listings have no tenant schema yet (see promote.service) —
    // querying it would throw "relation does not exist" and 500 the whole tab.
    if (!schema_provisioned_at) return { ...row, service_count: 0, location_count: 0 };
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
    // Media Gallery on the public profile — storage paths here, resolved by withImagePreviews.
    .select(...BUSINESS_COLUMNS, "b.gallery_images", "b.video_urls")
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

/**
 * The offices of a promoted-but-unclaimed listing. Promote deliberately copies no catalog — it is
 * "read through source_job_id" — so until the owner claims the listing (and gets a tenant schema
 * with `business_branches`), its branches are the scraped agent locations superadmin already
 * shows on the job's Agents tab. Without this the profile showed only a head office.
 */
export async function listScrapedBranches(sourceAgentId: string) {
  return masterKnex(`${S}.extraction_agent_locations as l`)
    .where("l.agent_id", sourceAgentId)
    .select(
      "l.id",
      masterKnex.raw(
        `case when l.is_head_office then 'Head Office'
              else coalesce(nullif(l.city, ''), nullif(l.state, ''), 'Office') end as name`,
      ),
      "l.country", "l.state", "l.city",
      // Scraped rows carry either a formatted address or the street lines it was built from.
      masterKnex.raw("coalesce(nullif(l.address, ''), nullif(concat_ws(', ', l.street1, l.street2), '')) as address"),
      "l.phone", "l.email",
      "l.is_head_office as is_primary",
      masterKnex.raw("null::text as branch_type"),
    )
    .orderBy([{ column: "l.is_head_office", order: "desc" }, { column: "l.city" }]);
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
    .whereNotNull("b.schema_provisioned_at") // unprovisioned promoted listings have no tenant services
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
  return masterKnex("business_representations as r")
    .leftJoin("businesses as tb", (join) => join.on("tb.id", "r.target_id").andOnVal("r.target_type", "business"))
    .leftJoin("institutions as ti", (join) => join.on("ti.id", "r.target_id").andOnVal("r.target_type", "institution"))
    .whereNull("r.deleted_at")
    .where({ "r.originator_id": businessId, "r.originator_type": "business" })
    .where("r.status", "active")
    .select(
      "r.uuid as id",
      "r.target_type as partner_kind",
      "r.target_id as partner_id",
      masterKnex.raw("COALESCE(tb.business_name, ti.institution_name) as partner_name"),
      masterKnex.raw("COALESCE(tb.logo_url, ti.logo_url) as partner_logo_url"),
    )
    .orderBy("partner_name");
}
