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
};

export type CourseSort = "best_match" | "fee_asc" | "fee_desc" | "duration_asc";

const EFFECTIVE_FEE = "coalesce(ec.domestic_fee_total, ec.international_fee_total)";

// Public visibility = the course's job was promoted to a business (promote.service.ts sets
// status 'exported'), minus courses an admin explicitly flagged in review.
const PUBLICLY_VISIBLE = `exists (select 1 from ${S}.extraction_jobs ej where ej.id = ec.job_id and ej.status = 'exported')
  and coalesce(ec.verification_status, '') <> 'flagged'`;

const LIST_COLUMNS = [
  "ec.id", "ec.name", "ec.short_name", "ec.degree_level", "ec.subject_area",
  "ec.duration_weeks", "ec.study_mode", "ec.description",
  "ec.domestic_fee_total", "ec.domestic_currency",
  "ec.international_fee_total", "ec.international_currency",
  "ec.awarding_institution", "ec.image_url",
  "c.name as country_name",
];

function baseQuery({ country, degreeLevel, subjectArea, search, feeMin, feeMax, currency, intakeYear }: CourseSearchFilters) {
  const q = masterKnex(`${S}.extraction_courses as ec`)
    .leftJoin("countries as c", (j) => j.on(masterKnex.raw("upper(c.iso2) = upper(ec.country_code)")))
    .whereRaw(PUBLICLY_VISIBLE);

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
    q.where((b) => b.where("ec.domestic_currency", currency).orWhere("ec.international_currency", currency));
  }
  if (intakeYear != null) {
    q.whereRaw(
      `exists (select 1 from ${S}.extraction_intakes ei where ei.course_id = ec.id and ei.intake_year = ?)`,
      [intakeYear],
    );
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

export async function listPublicCourses(
  filters: CourseSearchFilters, sort: CourseSort | undefined, limit: number, offset: number,
) {
  const rows = await applySort(baseQuery(filters), sort)
    .select(
      ...LIST_COLUMNS,
      masterKnex.raw(
        `(select ei.intake_year from ${S}.extraction_intakes ei
          where ei.course_id = ec.id
          order by ei.intake_year asc, ei.intake_month asc limit 1) as next_intake_year`,
      ),
      masterKnex.raw(
        `(select ei.intake_month from ${S}.extraction_intakes ei
          where ei.course_id = ec.id
          order by ei.intake_year asc, ei.intake_month asc limit 1) as next_intake_month`,
      ),
    )
    .limit(limit)
    .offset(offset);
  return rows.map((r: { id: string; name: string }) => ({ ...r, slug: courseSlug(r.name, r.id) }));
}

export async function countPublicCourses(filters: CourseSearchFilters) {
  const [row] = await baseQuery(filters).count("ec.id as count");
  return Number(row.count);
}

export async function listCourseFilterOptions() {
  const [years, currencies] = await Promise.all([
    masterKnex(`${S}.extraction_intakes`)
      .distinct("intake_year")
      .whereNotNull("intake_year")
      .orderBy("intake_year"),
    masterKnex(`${S}.extraction_courses`)
      .select(masterKnex.raw("unnest(array[domestic_currency, international_currency]) as currency"))
      .whereRaw("domestic_currency is not null or international_currency is not null"),
  ]);
  return {
    years: years.map((r: { intake_year: number }) => r.intake_year),
    currencies: [...new Set(currencies.map((r: { currency: string | null }) => r.currency).filter(Boolean))] as string[],
  };
}

export async function findPublicCourseBySlug(slug: string) {
  const fragment = parseCourseIdFragment(slug);
  if (!fragment) return null;

  const course = await masterKnex(`${S}.extraction_courses as ec`)
    .leftJoin("countries as c", (j) => j.on(masterKnex.raw("upper(c.iso2) = upper(ec.country_code)")))
    .whereRaw(PUBLICLY_VISIBLE)
    .whereRaw("left(replace(ec.id::text, '-', ''), 6) = ?", [fragment])
    .select(...LIST_COLUMNS)
    .first();
  if (!course) return null;

  const [intakes, eligibility, englishRequirements] = await Promise.all([
    masterKnex(`${S}.extraction_intakes`)
      .where({ course_id: course.id })
      .orderBy(["intake_year", "intake_month"]),
    masterKnex(`${S}.extraction_course_eligibility_assignments as a`)
      .join(`${S}.extraction_eligibility_requirements as er`, "er.id", "a.eligibility_requirement_id")
      .where("a.course_id", course.id)
      .select("er.*"),
    masterKnex(`${S}.extraction_english_requirements`).where({ course_id: course.id }),
  ]);

  return { ...course, slug: courseSlug(course.name, course.id), intakes, eligibility, englishRequirements };
}
