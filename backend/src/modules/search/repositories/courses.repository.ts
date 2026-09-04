// Public read-only course listings for the search page — sourced from the
// scraped extraction_courses table (superadmin schema); no live courses
// catalog exists yet (see business-services promote.service.ts stub).

import { masterKnex } from "../../../core/db/master-pool.js";
import { SUPERADMIN_SCHEMA as S } from "../../superadmin/consts.js";
import { courseSlug, parseCourseIdFragment } from "../utils/slug.js";

export type CourseSearchFilters = {
  country?: string;
  degreeLevel?: string;
  subjectArea?: string;
  search?: string;
  feeMin?: number;
  feeMax?: number;
  currency?: string;
  intakeYear?: number;
  /** Awarding institution, matched on the name the course carries. */
  institution?: string;
  /** Duration bucket in weeks as "min-max"; "157-" means 157 and up. */
  duration?: string;
  jobId?: string;
  /** Restricts to specific courses — how the saved-courses list reuses this query. */
  courseIds?: string[];
};

export type CourseSort = "best_match" | "fee_asc" | "fee_desc" | "duration_asc";

/**
 * Curated per-course links are the source of truth for fees, intakes, units, options and
 * campuses: the admin's course panel reads them through the junction tables, and re-extraction
 * rewrites those links while leaving the old child rows behind — still carrying `course_id`.
 * Reading a child table job-wide, or off the course row's own fee columns (which only some
 * extraction paths fill), is how these pages drifted from what the admin shows.
 *
 * One lateral per audience: the dearest linked fee that applies to it, which is the figure the
 * card, the stats strip and the budget filter all quote.
 */
function topFee(scope: "domestic" | "international", alias: string) {
  return `left join lateral (
    select f.total_amount, f.currency, f.period_type, nullif(f.installments, '[]'::jsonb) as installments
      from ${S}.extraction_course_fee_assignments fa
      join ${S}.extraction_course_fees f on f.id = fa.course_fee_id
     where fa.course_id = ec.id and f.total_amount > 0
       and coalesce(lower(f.student_type), 'both') in ('${scope}', 'both')
     order by f.total_amount desc limit 1) as ${alias} on true`;
}

const DOMESTIC_FEE = "coalesce(dfee.total_amount, ec.domestic_fee_total)";
const INTERNATIONAL_FEE = "coalesce(ifee.total_amount, ec.international_fee_total)";
const EFFECTIVE_FEE = `coalesce(${DOMESTIC_FEE}, ${INTERNATIONAL_FEE})`;

/** That fee's payment schedule, falling back to the one on the course row. */
const feeSchedule = (scope: "domestic" | "international") =>
  `coalesce(${scope === "domestic" ? "dfee" : "ifee"}.installments, ec.${scope}_fee_installments)`;

/** Only the intakes linked to the course — `extraction_intakes.course_id` also holds the rows a
 *  re-extraction superseded, which is why the page showed an intake the admin no longer lists.
 *  Exported so the institutions tab's intake filter and facets can't drift from this rule. */
export const COURSE_INTAKES = `${S}.extraction_intakes ei
  join ${S}.extraction_course_intake_assignments ia on ia.intake_id = ei.id`;

/** Campuses to show for a course (alias `cam`): the ones linked to it, or — for a course with no
 *  links at all — every campus of its institution, which is what these pages showed before. */
const campusFilter = (course: string) => `(
  exists (select 1 from ${S}.extraction_course_campuses cc
           where cc.course_id = ${course} and cc.campus_id = cam.id)
  or not exists (select 1 from ${S}.extraction_course_campuses cc where cc.course_id = ${course}))`;

/**
 * Public visibility = the course's job was promoted to a business (promote.service.ts sets status
 * 'exported'), and an admin hasn't rejected the course.
 *
 * 'flagged' is what reject/bulk-reject write (courses.service.ts) — showing a rejected course to
 * students is the one verification state that must not leak. The other states stay visible:
 * requiring 'confirmed' would empty the catalog, since an extracted course starts 'unverified'
 * and most are never hand-approved.
 */
export const NOT_REJECTED = "coalesce(ec.verification_status, 'unverified') <> 'flagged'";

const PUBLICLY_VISIBLE = `exists (select 1 from ${S}.extraction_jobs ej where ej.id = ec.job_id and ej.status = 'exported')
  and ${NOT_REJECTED}`;

/**
 * The institution's crest. Promote copies the scraped logo into `institutions.logo_url`, but a
 * job re-scraped (or enriched) after that leaves the copy stale or null — and a job that was
 * exported but never promoted has no institutions row at all. Falling back to the extraction
 * overview means the public pages always show the authentic scraped crest.
 *
 * A correlated subquery rather than a join: `extraction_institution_overview` has no unique
 * index on job_id, so joining it could fan a course row out into several.
 */
const INSTITUTION_CREST = masterKnex.raw(
  `coalesce(inst.logo_url, (select ei.logo_url from ${S}.extraction_institution_overview ei
      where ei.job_id = ec.job_id and ei.logo_url is not null limit 1)) as institution_logo_url`,
);

const LIST_COLUMNS = [
  "ec.id", "ec.name", "ec.short_name", "ec.degree_level", "ec.subject_area",
  "ec.duration_weeks", "ec.study_mode", "ec.description",
  masterKnex.raw(`${DOMESTIC_FEE} as domestic_fee_total`),
  masterKnex.raw("coalesce(dfee.currency, ec.domestic_currency) as domestic_currency"),
  masterKnex.raw(`${INTERNATIONAL_FEE} as international_fee_total`),
  masterKnex.raw("coalesce(ifee.currency, ec.international_currency) as international_currency"),
  // What the amount actually covers — a linked fee can be quoted per year, not per course.
  masterKnex.raw("dfee.period_type as domestic_fee_period"),
  masterKnex.raw("ifee.period_type as international_fee_period"),
  "ec.awarding_institution", "ec.image_url", "ec.source_url",
  "c.name as country_name",
  // Card fields: the flag comes from the ISO2 the country join already matches on, and the
  // crest from the promoted institution that shares this course's extraction job.
  "ec.country_code", INSTITUTION_CREST,
];

/**
 * Per-installment amount, but only when the fee actually splits into more than one payment —
 * parseInstallments emits a single `[{label:"Total"}]` entry when it can't find a schedule, and
 * showing that as "per installment" would just restate the total.
 */
function installmentColumn(scope: "domestic" | "international") {
  const schedule = feeSchedule(scope);
  return masterKnex.raw(
    `case when jsonb_array_length(coalesce(${schedule}, '[]'::jsonb)) > 1
          then (${schedule})->0->>'amount' end as ${scope}_fee_installment`,
  );
}

// Campus cities for the card's "Location:" chips. Campuses belong to the extraction job, so
// every course from the same institution shares them; state stands in when a campus has no city.
const CAMPUS_LOCATIONS = masterKnex.raw(
  `(select array_agg(distinct coalesce(cam.city, cam.state) order by coalesce(cam.city, cam.state))
      from ${S}.extraction_campuses cam
     where cam.job_id = ec.job_id and coalesce(cam.city, cam.state) is not null
       and ${campusFilter("ec.id")}) as campus_locations`,
);

const CARD_COLUMNS = [CAMPUS_LOCATIONS, installmentColumn("domestic"), installmentColumn("international")];

/** The joins and visibility rule every public course read shares. */
function courseQuery() {
  return masterKnex(`${S}.extraction_courses as ec`)
    .leftJoin("countries as c", (j) => j.on(masterKnex.raw("upper(c.iso2) = upper(ec.country_code)")))
    // At most one institution per job (institutions_source_job_uniq), so this can't fan rows out.
    .leftJoin("institutions as inst", (j) => j.on("inst.source_job_id", "ec.job_id").andOnVal("inst.is_published", true))
    .joinRaw(topFee("domestic", "dfee"))
    .joinRaw(topFee("international", "ifee"))
    .whereRaw(PUBLICLY_VISIBLE);
}

function baseQuery({
  country, degreeLevel, subjectArea, search, feeMin, feeMax, currency, intakeYear,
  institution, duration, jobId, courseIds,
}: CourseSearchFilters) {
  const q = masterKnex(`${S}.extraction_courses as ec`)
    .leftJoin("countries as c", (j) => j.on(masterKnex.raw("upper(c.iso2) = upper(ec.country_code)")))
    // At most one institution per job (institutions_source_job_uniq), so this can't fan rows out.
    .join("institutions as inst", (j) => j.on("inst.source_job_id", "ec.job_id").andOnVal("inst.is_published", true))
    .whereRaw(PUBLICLY_VISIBLE);

  if (jobId) q.where("ec.job_id", jobId);
  if (courseIds) q.whereIn("ec.id", courseIds);
  if (country) {
    q.where((b) =>
      b.whereRaw("lower(c.name) = lower(?)", [country]).orWhereRaw("lower(c.slug) = lower(?)", [country]),
    );
  }
  if (degreeLevel) q.where("ec.degree_level", degreeLevel);
  if (subjectArea) q.whereILike("ec.subject_area", `%${subjectArea}%`);
  if (search) {
    q.where((b) => b.whereILike("ec.name", `%${search}%`).orWhereILike("ec.awarding_institution", `%${search}%`));
  }
  // Budget filter reads whichever fee is populated — domestic first, falling back to international.
  if (feeMin != null) q.whereRaw(`${EFFECTIVE_FEE} >= ?`, [feeMin]);
  if (feeMax != null) q.whereRaw(`${EFFECTIVE_FEE} <= ?`, [feeMax]);
  // "Fees in X" filters to courses actually quoted in that currency — no FX conversion pipeline exists in V3 yet.
  if (currency) {
    q.whereRaw(
      "? in (coalesce(dfee.currency, ec.domestic_currency), coalesce(ifee.currency, ec.international_currency))",
      [currency],
    );
  }
  if (intakeYear != null) {
    q.whereRaw(
      `exists (select 1 from ${COURSE_INTAKES} where ia.course_id = ec.id and ei.intake_year = ?)`,
      [intakeYear],
    );
  }
  // Case-insensitive equality rather than ILIKE: the values come from the facet list, which is
  // this same column, so a partial match would only ever be an accident.
  if (institution) q.whereRaw("lower(ec.awarding_institution) = lower(?)", [institution]);
  if (duration) {
    // "min-max", max optional. A course with no duration is excluded rather than assumed short.
    const [min, max] = duration.split("-");
    q.where("ec.duration_weeks", ">=", Number(min));
    if (max) q.where("ec.duration_weeks", "<=", Number(max));
  }
  return q;
}

function applySort(q: ReturnType<typeof baseQuery>, sort: CourseSort | undefined) {
  switch (sort) {
    case "fee_asc": return q.orderByRaw(`${EFFECTIVE_FEE} asc nulls last`);
    case "fee_desc": return q.orderByRaw(`${EFFECTIVE_FEE} desc nulls last`);
    case "duration_asc": return q.orderByRaw("ec.duration_weeks asc nulls last");
    default: return q.orderBy("ec.name");
  }
}

/** Only the fields callers narrow on — the select list is the full row shape. */
type PublicCourseRow = {
  id: string;
  name: string;
  institution_logo_url: string | null;
  campus_locations: string[] | null;
};

export async function listPublicCourses(
  filters: CourseSearchFilters, sort: CourseSort | undefined, limit: number, offset: number,
) {
  const rows = await applySort(baseQuery(filters), sort)
    .select(
      ...LIST_COLUMNS,
      ...CARD_COLUMNS,
      masterKnex.raw(
        `(select ei.intake_year from ${COURSE_INTAKES}
          where ia.course_id = ec.id
          order by ei.intake_year asc, ei.intake_month asc limit 1) as next_intake_year`,
      ),
      masterKnex.raw(
        `(select ei.intake_month from ${COURSE_INTAKES}
          where ia.course_id = ec.id
          order by ei.intake_year asc, ei.intake_month asc limit 1) as next_intake_month`,
      ),
    )
    .limit(limit)
    .offset(offset);
  return rows.map((r: PublicCourseRow) => ({ ...r, slug: courseSlug(r.name, r.id) }));
}

export async function countPublicCourses(filters: CourseSearchFilters) {
  const [row] = await baseQuery(filters).count("ec.id as count");
  return Number(row.count);
}

type FacetRow = { name: string; count: string };

const toFacets = (rows: unknown[]) => (rows as FacetRow[]).map((r) => ({ name: r.name, count: Number(r.count) }));

/** One tile of the profile's subject-area grid — its degree spread and what it costs to study. */
export type SubjectAreaSummary = {
  name: string;
  count: number;
  degrees: { name: string; count: number }[];
  cost_min: number | null;
  cost_max: number | null;
  currency: string | null;
};

type AreaRow = { area: string; level: string | null; count: string; fee_min: string | null; fee_max: string | null; currency: string | null };

/**
 * The catalog broken down for the institution profile: one summary per subject area (with its
 * degree-level spread and fee range) plus the flat level counts the course tabs use. Both go
 * through `baseQuery`, so the numbers can't disagree with the list those tabs then load.
 */
export async function listCourseFacets(jobId: string) {
  const [areaRows, degreeLevels] = await Promise.all([
    // Grouped by (area, level) — one pass gives both the per-area totals and their degree spread.
    baseQuery({ jobId }).whereNotNull("ec.subject_area")
      .select("ec.subject_area as area", "ec.degree_level as level")
      .count("ec.id as count")
      // A zero fee means "not captured", not "free" — nullif keeps it out of the range.
      .select(masterKnex.raw(`min(nullif(${EFFECTIVE_FEE}, 0)) as fee_min`))
      .select(masterKnex.raw(`max(nullif(${EFFECTIVE_FEE}, 0)) as fee_max`))
      .select(masterKnex.raw("min(coalesce(ec.domestic_currency, ec.international_currency)) as currency"))
      .groupBy("ec.subject_area", "ec.degree_level"),
    baseQuery({ jobId }).whereNotNull("ec.degree_level")
      .select("ec.degree_level as name").count("ec.id as count")
      .groupBy("ec.degree_level").orderBy([{ column: "count", order: "desc" }, { column: "name" }]),
  ]);

  const areas = new Map<string, SubjectAreaSummary>();
  for (const row of areaRows as unknown as AreaRow[]) {
    const summary = areas.get(row.area)
      ?? { name: row.area, count: 0, degrees: [], cost_min: null, cost_max: null, currency: null };
    const count = Number(row.count);
    summary.count += count;
    if (row.level) summary.degrees.push({ name: row.level, count });

    const min = row.fee_min == null ? null : Number(row.fee_min);
    const max = row.fee_max == null ? null : Number(row.fee_max);
    if (min != null && (summary.cost_min == null || min < summary.cost_min)) summary.cost_min = min;
    if (max != null && (summary.cost_max == null || max > summary.cost_max)) summary.cost_max = max;
    summary.currency ??= row.currency;

    areas.set(row.area, summary);
  }

  const subject_areas = [...areas.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  for (const area of subject_areas) area.degrees.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  return { subject_areas, degree_levels: toFacets(degreeLevels) };
}

export async function listCourseFilterOptions() {
  const [years, currencies, degreeLevels, institutions] = await Promise.all([
    masterKnex(`${S}.extraction_intakes`)
      .distinct("intake_year")
      .whereNotNull("intake_year")
      .orderBy("intake_year"),
    masterKnex(`${S}.extraction_courses`)
      .select(masterKnex.raw("unnest(array[domestic_currency, international_currency]) as currency"))
      .whereRaw("domestic_currency is not null or international_currency is not null"),
    masterKnex(`${S}.extraction_courses`)
      .distinct("degree_level")
      .whereNotNull("degree_level")
      .orderBy("degree_level"),
    // Only institutions with a publicly visible course, so the filter can't offer a name that
    // returns nothing. Same inner join as baseQuery: an unpublished institution's job can still be
    // exported, so the join (not just PUBLICLY_VISIBLE) is what actually excludes it.
    masterKnex(`${S}.extraction_courses as ec`)
      .join("institutions as inst", (j) => j.on("inst.source_job_id", "ec.job_id").andOnVal("inst.is_published", true))
      .distinct("ec.awarding_institution")
      .whereNotNull("ec.awarding_institution")
      .whereRaw(PUBLICLY_VISIBLE)
      .orderBy("ec.awarding_institution"),
  ]);
  return {
    years: years.map((r: { intake_year: number }) => r.intake_year),
    currencies: [...new Set(currencies.map((r: { currency: string | null }) => r.currency).filter(Boolean))] as string[],
    degree_levels: degreeLevels.map((r: { degree_level: string }) => r.degree_level),
    institutions: institutions.map((r: { awarding_institution: string }) => r.awarding_institution),
  };
}

// The provider and place columns the detail page needs on top of the card: the awarding
// institution (its own hero/link) and the destination country's seasonal weather.
const DETAIL_COLUMNS = [
  "ec.job_id",
  "inst.id as institution_id", "inst.institution_name", "inst.cover_url as institution_cover_url",
  "inst.website as institution_website", "inst.city as institution_city",
  "inst.gallery_images as institution_gallery_images",
  masterKnex.raw(`${feeSchedule("domestic")} as domestic_fee_installments`),
  masterKnex.raw(`${feeSchedule("international")} as international_fee_installments`),
  "inst.facebook_url as institution_facebook_url", "inst.instagram_url as institution_instagram_url",
  "inst.twitter_url as institution_twitter_url", "inst.linkedin_url as institution_linkedin_url",
  "inst.youtube_url as institution_youtube_url",
  "c.weather_summer", "c.weather_autumn", "c.weather_winter", "c.weather_spring",
];

/**
 * The public city page for a campus city, when the platform has one — the Locations card's
 * "Explore the city" link. Matched on name + country because scraped campuses carry no city id.
 */
export async function findCityLink(cityName: string | null, countryCode: string | null) {
  if (!cityName || !countryCode) return null;
  const row = await masterKnex("cities as ci")
    .join("countries as co", "co.id", "ci.country_id")
    .whereRaw("lower(ci.name) = lower(?)", [cityName])
    .whereRaw("upper(co.iso2) = upper(?)", [countryCode])
    .where("ci.status", "active")
    .whereNull("ci.deleted_at")
    .select("ci.name", "ci.slug", "co.slug as country_slug")
    .first();
  if (!row?.slug || !row.country_slug) return null;
  return { name: row.name as string, href: `/city/${row.country_slug}/${row.slug}` };
}

/**
 * Where the course is taught. `extraction_campuses` is keyed to the extraction job, so the
 * institution's whole campus list is not the course's — the links say which of them teach it.
 * Distinct because `extraction_course_campuses` has no unique constraint on (course, campus).
 */
export async function listCourseCampuses(courseId: string, jobId: string) {
  return masterKnex(`${S}.extraction_campuses as cam`)
    .where("cam.job_id", jobId)
    .whereRaw(campusFilter("?"), [courseId, courseId])
    .distinct("cam.id", "cam.name", "cam.address", "cam.city", "cam.state", "cam.country", "cam.phone", "cam.email")
    .orderBy("cam.name");
}

export async function findPublicCourseBySlug(slug: string) {
  const fragment = parseCourseIdFragment(slug);
  if (!fragment) return null;

  const course = await masterKnex(`${S}.extraction_courses as ec`)
    .leftJoin("countries as c", (j) => j.on(masterKnex.raw("upper(c.iso2) = upper(ec.country_code)")))
    // Inner join — see baseQuery above: a left join here would let an unpublished institution's
    // course detail page stay reachable by direct link even though it's excluded from search.
    .join("institutions as inst", (j) => j.on("inst.source_job_id", "ec.job_id").andOnVal("inst.is_published", true))
    .whereRaw(PUBLICLY_VISIBLE)
    .whereRaw("left(replace(ec.id::text, '-', ''), 6) = ?", [fragment])
    .select(...LIST_COLUMNS, ...CARD_COLUMNS, ...DETAIL_COLUMNS)
    .first();
  if (!course) return null;

  // Every junction below carries a unique (course_id, entity_id), so none of these joins fan out.
  const [intakes, eligibility, englishRequirements, studyUnits, studyOptions] = await Promise.all([
    masterKnex(`${S}.extraction_intakes as ei`)
      .join(`${S}.extraction_course_intake_assignments as ia`, "ia.intake_id", "ei.id")
      .where("ia.course_id", course.id)
      .select("ei.*")
      .orderBy(["ei.intake_year", "ei.intake_month", "ei.start_date"]),
    masterKnex(`${S}.extraction_course_eligibility_assignments as a`)
      .join(`${S}.extraction_eligibility_requirements as er`, "er.id", "a.eligibility_requirement_id")
      .where("a.course_id", course.id)
      .select("er.*"),
    masterKnex(`${S}.extraction_english_requirements`).where({ course_id: course.id }),
    masterKnex(`${S}.extraction_study_units as u`)
      .join(`${S}.extraction_course_study_unit_assignments as ua`, "ua.study_unit_id", "u.id")
      .where("ua.course_id", course.id)
      .select("u.id", "u.unit_code", "u.unit_name", "u.credit_points", "u.unit_type", "u.description")
      .orderBy(["u.unit_code", "u.unit_name"]),
    masterKnex(`${S}.extraction_study_options as o`)
      .join(`${S}.extraction_course_study_option_assignments as oa`, "oa.study_option_id", "o.id")
      .where("oa.course_id", course.id)
      .select("o.id", "o.name", "o.study_mode", "o.study_load", "o.duration_value", "o.duration_unit", "o.applicable_to")
      .orderBy("o.created_at"),
  ]);

  return {
    ...course,
    slug: courseSlug(course.name, course.id),
    intakes, eligibility, englishRequirements,
    study_units: studyUnits,
    study_options: studyOptions,
  };
}
