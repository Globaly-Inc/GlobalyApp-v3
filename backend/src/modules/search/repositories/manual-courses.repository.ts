// Public "Courses" search only reads extraction_courses (see courses.repository.ts's header
// comment), but a superadmin can also add a "Academic Courses"-category service by hand — a
// business_services row in a business/institution's own tenant schema. Those were otherwise only
// reachable via that business's own profile page and never turned up in course search. This module
// fans out across every published, schema-provisioned org's tenant schema (same database, a
// different search_path each) looking for published "courses"-category services, so a search for
// one by name actually finds it.
//
// ponytail: wired into `/search/courses` only when a `search` term is present (courses.routes.ts)
// — an unfiltered browse still relies on the extraction catalog's SQL-side pagination alone, since
// querying every tenant schema on every page load would defeat that. Advanced filters
// (country/fee/degree/duration/intake year) aren't applied to these rows either: this is a small,
// name-matched result set, not a parallel filterable catalog. degree_level/subject_area are left
// null (available in principle via schema_field_values, but that table lives per-tenant while its
// field definitions live in the master schema — not worth the cross-schema join for a value the
// card already renders fine as "—").

import type { Knex } from "knex";
import { masterKnex } from "../../../core/db/master-pool.js";
import { getKnex } from "../../../core/db/pool-manager.js";
import { courseSlug, parseCourseIdFragment } from "../utils/slug.js";

/** An unescaped `%`/`_` in a public search box would otherwise become an ILIKE wildcard —
 * `%` alone matches every manual course in every tenant schema, and each match then costs 4 more
 * per-tenant queries below. Escaping makes the search term literal, same as Postgres's own
 * backslash-escape default for ILIKE. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

/** Caps how many matched services get the (4-query) detail enrichment below — a public,
 * unauthenticated search shouldn't be able to fan a broad term out into unbounded tenant work. */
const MAX_MANUAL_RESULTS = 20;

type OrgRow = {
  id: number; name: string; subdomain: string; schema_name: string;
  logo_url: string | null; cover_url: string | null; website: string | null;
  city: string | null; country_id: number | null;
  facebook_url: string | null; instagram_url: string | null; twitter_url: string | null;
  linkedin_url: string | null; youtube_url: string | null;
};

const ORG_COLUMNS = [
  "id", "subdomain", "schema_name", "logo_url", "cover_url", "website",
  "city", "country_id", "facebook_url", "instagram_url", "twitter_url", "linkedin_url", "youtube_url",
];

async function publishedOrgs(): Promise<OrgRow[]> {
  const [businesses, institutions] = await Promise.all([
    masterKnex("businesses").where({ is_published: true }).whereNull("deleted_at").whereNotNull("schema_provisioned_at")
      .select("business_name as name", ...ORG_COLUMNS),
    masterKnex("institutions").where({ is_published: true }).whereNull("deleted_at").whereNotNull("schema_provisioned_at")
      .select("institution_name as name", ...ORG_COLUMNS),
  ]);
  return [...businesses, ...institutions] as OrgRow[];
}

function weeksFromDuration(value: number | null, unit: string | null): number | null {
  if (!value) return null;
  const u = (unit ?? "months").toLowerCase();
  if (u.startsWith("day")) return Math.round(value / 7);
  if (u.startsWith("w")) return value;
  if (u.startsWith("mo")) return Math.round((value * 52) / 12);
  if (u.startsWith("y")) return value * 52;
  return Math.round((value * 52) / 12);
}

function serviceQuery(db: Knex) {
  return db("business_services as s")
    .join("service_categories as cat", "cat.id", "s.service_category_id")
    .where("cat.slug", "courses")
    .where("s.is_published", true)
    .whereNull("s.deleted_at");
}

async function firstStudyOption(db: Knex, serviceId: string) {
  return db("service_study_options").where("service_id", serviceId).orderBy("id").first();
}

async function nextIntake(db: Knex, serviceId: string) {
  const now = new Date();
  return db("service_intakes")
    .where("service_id", serviceId)
    .whereNotNull("intake_year")
    .whereRaw("(intake_year * 100 + coalesce(intake_month, 1)) >= ?", [now.getFullYear() * 100 + (now.getMonth() + 1)])
    .orderBy("intake_year", "asc").orderBy("intake_month", "asc")
    .first();
}

async function topFeeRow(db: Knex, serviceId: string, scope: "domestic" | "international") {
  return db("service_fees")
    .where("service_id", serviceId)
    .whereRaw("coalesce(lower(student_type), 'both') in (?, 'both')", [scope])
    .orderBy("total_amount", "desc")
    .first();
}

async function countryNamesFor(orgs: OrgRow[]) {
  const ids = [...new Set(orgs.map((o) => o.country_id).filter((id): id is number => id != null))];
  if (ids.length === 0) return new Map<number, { name: string; iso2: string | null }>();
  const rows = await masterKnex("countries").whereIn("id", ids).select("id", "name", "iso2");
  return new Map(rows.map((r: { id: number; name: string; iso2: string | null }) => [r.id, { name: r.name, iso2: r.iso2 }]));
}

export type ManualCourseCard = {
  id: string; name: string; short_name: null; degree_level: null; subject_area: null;
  duration_weeks: number | null; study_mode: string | null; description: string | null;
  domestic_fee_total: string | null; domestic_currency: string | null;
  international_fee_total: string | null; international_currency: string | null;
  domestic_fee_period: string | null; international_fee_period: string | null;
  awarding_institution: string; image_url: null; source_url: null;
  country_name: string | null; country_code: string | null;
  institution_logo_url: string | null; campus_locations: string[];
  domestic_fee_installment: null; international_fee_installment: null;
  next_intake_year: number | null; next_intake_month: number | null;
  slug: string;
};

type MatchedService = { org: OrgRow; row: { id: string; name: string; description: string | null } };

/** The cheap part: just which services match, across every tenant — no per-row detail queries. */
async function matchedManualServices(search: string): Promise<MatchedService[]> {
  const orgs = await publishedOrgs();
  const escaped = escapeLike(search);
  const perOrg = await Promise.all(orgs.map(async (org) => {
    const db = await getKnex(org.id, org.schema_name);
    // An org whose own name matches the search shows all its courses; otherwise only
    // courses whose own name/description matches.
    const q = serviceQuery(db).select("s.uuid as id", "s.name", "s.description");
    if (!org.name.toLowerCase().includes(search.toLowerCase())) {
      q.where((w) => w.whereILike("s.name", `%${escaped}%`).orWhereILike("s.description", `%${escaped}%`));
    }
    const rows = await q.catch(() => [] as { id: string; name: string; description: string | null }[]);
    return { org, rows };
  }));
  return perOrg.flatMap(({ org, rows }) => rows.map((row) => ({ org, row })));
}

/** For the search result count/totalPages — cheap (no per-row detail enrichment), so it's safe
 * to call on every page even though the actual cards are only fetched for page 1. */
export async function countPublicManualCourses(search: string): Promise<number> {
  return (await matchedManualServices(search)).length;
}

export async function listPublicManualCourses(search: string): Promise<ManualCourseCard[]> {
  const orgs = await publishedOrgs();
  const countries = await countryNamesFor(orgs);
  const country = (org: OrgRow) => (org.country_id != null ? countries.get(org.country_id) : undefined);

  // Capped BEFORE the per-row detail enrichment below — that's the expensive part
  // (4 more queries per row), not the cheap name/description lookup above.
  const matched = (await matchedManualServices(search)).slice(0, MAX_MANUAL_RESULTS);

  const cards: ManualCourseCard[] = [];
  for (const { org, row } of matched) {
    const db = await getKnex(org.id, org.schema_name);
    const [option, intake, domesticFee, internationalFee] = await Promise.all([
      firstStudyOption(db, row.id),
      nextIntake(db, row.id),
      topFeeRow(db, row.id, "domestic"),
      topFeeRow(db, row.id, "international"),
    ]);
    cards.push({
      id: row.id, name: row.name, short_name: null, degree_level: null, subject_area: null,
      duration_weeks: option ? weeksFromDuration(option.duration_value, option.duration_unit) : null,
      study_mode: option?.study_mode ?? null,
      description: row.description,
      domestic_fee_total: domesticFee?.total_amount ?? null, domestic_currency: domesticFee?.currency ?? null,
      international_fee_total: internationalFee?.total_amount ?? null, international_currency: internationalFee?.currency ?? null,
      domestic_fee_period: domesticFee?.period_type ?? null, international_fee_period: internationalFee?.period_type ?? null,
      awarding_institution: org.name, image_url: null, source_url: null,
      country_name: country(org)?.name ?? null, country_code: country(org)?.iso2 ?? null,
      institution_logo_url: org.logo_url, campus_locations: [],
      domestic_fee_installment: null, international_fee_installment: null,
      next_intake_year: intake?.intake_year ?? null, next_intake_month: intake?.intake_month ?? null,
      slug: courseSlug(row.name, row.id),
    });
  }
  return cards;
}

/**
 * Matched on the FULL slug (slugified name + id fragment), not the 6-hex-char fragment alone —
 * that fragment is only unique within one table's rows. Fanning across every tenant schema (and
 * falling back here only after the separate extraction catalog already missed) makes a
 * fragment-only match meaningfully more likely to collide than the single-table lookup
 * courses.repository.ts uses, so this side can't take the same shortcut.
 *
 * The fragment is still pushed into the SQL WHERE (same as courses.repository.ts's own slug
 * lookup) before the full-slug comparison runs in JS — every published tenant's ENTIRE course
 * list is not a bound any public, unauthenticated "course not found" request should be able to
 * force; this way each tenant returns at most a couple of rows to check, not its whole catalog.
 */
export async function findPublicManualCourseBySlug(slug: string) {
  const fragment = parseCourseIdFragment(slug);
  if (!fragment) return null;

  const orgs = await publishedOrgs();
  for (const org of orgs) {
    const db = await getKnex(org.id, org.schema_name);
    const row = await serviceQuery(db)
      .whereRaw("left(replace(s.uuid::text, '-', ''), 6) = ?", [fragment])
      .select("s.uuid as id", "s.name", "s.description")
      .catch(() => [] as { id: string; name: string; description: string | null }[]);
    const match = (row as { id: string; name: string; description: string | null }[])
      .find((r) => courseSlug(r.name, r.id) === slug);
    if (!match) continue;

    const [intakes, eligibility, studyUnits, studyOptions, domesticFee, internationalFee, countries] = await Promise.all([
      db("service_intakes").where("service_id", match.id).orderBy("start_date"),
      db("service_eligibility_requirements").where("service_id", match.id),
      db("service_study_units").where("service_id", match.id),
      db("service_study_options").where("service_id", match.id),
      topFeeRow(db, match.id, "domestic"),
      topFeeRow(db, match.id, "international"),
      countryNamesFor([org]),
    ]);
    const country = org.country_id != null ? countries.get(org.country_id) : undefined;

    return {
      id: match.id, name: match.name, description: match.description,
      short_name: null, degree_level: null, subject_area: null,
      duration_weeks: studyOptions[0] ? weeksFromDuration(studyOptions[0].duration_value, studyOptions[0].duration_unit) : null,
      study_mode: studyOptions[0]?.study_mode ?? null,
      domestic_fee_total: domesticFee?.total_amount ?? null, domestic_currency: domesticFee?.currency ?? null,
      international_fee_total: internationalFee?.total_amount ?? null, international_currency: internationalFee?.currency ?? null,
      domestic_fee_period: domesticFee?.period_type ?? null, international_fee_period: internationalFee?.period_type ?? null,
      domestic_fee_installments: domesticFee?.installments ?? null, international_fee_installments: internationalFee?.installments ?? null,
      awarding_institution: org.name, image_url: null, source_url: null,
      country_name: country?.name ?? null, country_code: country?.iso2 ?? null,
      institution_logo_url: org.logo_url, campus_locations: [],
      domestic_fee_installment: null, international_fee_installment: null,
      next_intake_year: null, next_intake_month: null,
      slug: courseSlug(match.name, match.id),
      institution: {
        id: String(org.id), slug: courseSlug(org.name, String(org.id).padStart(6, "0")),
        name: org.name, logo_url: org.logo_url, cover_url: org.cover_url, website: org.website, city: org.city,
        facebook_url: org.facebook_url, instagram_url: org.instagram_url, twitter_url: org.twitter_url,
        linkedin_url: org.linkedin_url, youtube_url: org.youtube_url,
      },
      campuses: [],
      weather: null,
      city_link: null,
      intakes: intakes.map((i) => ({
        id: i.id, intake_name: i.intake_name, start_date: i.start_date, end_date: i.end_date,
        admission_deadline: i.admission_deadline, intake_month: i.intake_month, intake_year: i.intake_year,
      })),
      eligibility: eligibility.map((e) => ({
        id: e.id, name: e.name, applicable_to: e.applicable_to,
        min_degree_level: null, min_score_percent: null,
        min_score: e.min_score, score_type: e.score_type, description: null,
        academic_tests: null, language_tests: null,
      })),
      englishRequirements: [],
      study_units: studyUnits.map((u) => ({
        id: u.id, unit_code: u.unit_code, unit_name: u.unit_name,
        credit_points: u.credit_points, unit_type: u.unit_type, description: u.description,
      })),
      study_options: studyOptions.map((o) => ({
        id: o.id, name: o.name, study_mode: o.study_mode, study_load: o.study_load,
        duration_value: o.duration_value, duration_unit: o.duration_unit, applicable_to: o.applicable_to,
      })),
    };
  }
  return null;
}
