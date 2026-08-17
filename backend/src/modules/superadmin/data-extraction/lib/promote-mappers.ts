// Pure staged-row → live-catalog-row mapping. No database access, so the awkward
// parts (reference resolution, enum normalisation, which fields are load-bearing)
// are unit-testable without a job or a tenant schema.
//
// Two classes of failure, kept strictly apart:
//   - `warnings`: an optional reference did not resolve. The row still promotes
//     with NULL, matching the catalog migration's stated stance ("nullable
//     because V1 ids may not resolve; the loader reports unresolved values rather
//     than dropping the row").
//   - a null return: the row cannot produce a valid live row at all. The caller
//     reports it and leaves it in staging. Never guessed at, never dropped.

/** Reference names and slugs collapse to the same key: "Graduate Diploma" ≡ "graduate_diploma". */
function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_\-/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface ReferenceRow {
  id: number;
  name: string;
  slug?: string | null;
}

/** name → id and slug → id in one lookup, both normalized. */
export function buildRefIndex(rows: readonly ReferenceRow[]): Map<string, number> {
  const index = new Map<string, number>();
  for (const row of rows) {
    if (row.name) index.set(normalizeKey(row.name), row.id);
    if (row.slug) index.set(normalizeKey(row.slug), row.id);
  }
  return index;
}

/** First candidate that resolves wins; null when none do. */
export function resolveRef(
  index: Map<string, number>,
  ...candidates: readonly (string | null | undefined)[]
): number | null {
  for (const candidate of candidates) {
    if (!candidate || !candidate.trim()) continue;
    const id = index.get(normalizeKey(candidate));
    if (id !== undefined) return id;
  }
  return null;
}

// ── Enum normalisation ──────────────────────────────────────────────────────
// The live study-option table has CHECK constraints; staged values are whatever
// the extractor wrote. An unmapped value must not be coerced into a default —
// "we could not tell" is information the reviewer needs.

function enumNormalizer<T extends string>(canonical: readonly T[], aliases: Record<string, T>) {
  const table = new Map<string, T>();
  for (const value of canonical) table.set(normalizeKey(value), value);
  for (const [alias, value] of Object.entries(aliases)) table.set(normalizeKey(alias), value);
  return (raw: string | null | undefined): T | null => {
    if (!raw || !raw.trim()) return null;
    return table.get(normalizeKey(raw)) ?? null;
  };
}

export const normalizeStudyMode = enumNormalizer(["on_campus", "online", "blended"] as const, {
  campus: "on_campus",
  "in person": "on_campus",
  "face to face": "on_campus",
  onsite: "on_campus",
  distance: "online",
  remote: "online",
  virtual: "online",
  hybrid: "blended",
  mixed: "blended",
});

export const normalizeStudyLoad = enumNormalizer(["full_time", "part_time"] as const, {
  full: "full_time",
  fulltime: "full_time",
  part: "part_time",
  parttime: "part_time",
});

export const normalizeDurationUnit = enumNormalizer(["days", "weeks", "months", "years"] as const, {
  day: "days",
  week: "weeks",
  month: "months",
  year: "years",
  yrs: "years",
});

export const normalizeApplicableTo = enumNormalizer(["international", "domestic", "both"] as const, {
  intl: "international",
  overseas: "international",
  offshore: "international",
  local: "domestic",
  onshore: "domestic",
  all: "both",
  any: "both",
});

export const normalizeStudentType = enumNormalizer(["international", "domestic", "both"] as const, {
  intl: "international",
  overseas: "international",
  local: "domestic",
  all: "both",
});

export const normalizeUnitType = enumNormalizer(["compulsory", "elective"] as const, {
  core: "compulsory",
  required: "compulsory",
  mandatory: "compulsory",
  optional: "elective",
});

// ── Row mappers ─────────────────────────────────────────────────────────────

export interface StagedCourse {
  id: string;
  name: string | null;
  short_name?: string | null;
  degree_level?: string | null;
  degree_level_code?: string | null;
  subject_area?: string | null;
  subject_area_code?: string | null;
  duration_weeks?: number | null;
  study_mode?: string | null;
  description?: string | null;
  domestic_fee_total?: string | number | null;
  domestic_currency?: string | null;
  international_fee_total?: string | number | null;
  international_currency?: string | null;
  awarding_institution?: string | null;
  brochure_url?: string | null;
  image_url?: string | null;
  career_paths?: string[] | null;
  source_url?: string | null;
  verification_status?: string | null;
  course_status?: number | null;
}

export interface MapResult<T> {
  row: T | null;
  /** Empty unless an optional reference failed to resolve. */
  warnings: string[];
  /** Set when the row cannot be promoted at all. */
  reason?: string;
}

export interface ServiceRow {
  extraction_source_id: string;
  name: string;
  slug: string | null;
  description: string | null;
  service_category_id: number | null;
  degree_level_id: number | null;
  area_of_study_id: number | null;
  duration_value: number | null;
  duration_unit: string | null;
  study_mode: string[] | null;
  price: string | number | null;
  price_currency: string | null;
  price_type: string;
  image_url: string | null;
  brochure_url: string | null;
  tags: string[] | null;
  is_published: boolean;
  meta: string;
}

export interface CourseMapContext {
  serviceCategoryId: number | null;
  degreeLevels: Map<string, number>;
  areasOfStudy: Map<string, number>;
  publish: boolean;
  jobId: string;
}

/** Deterministic, collision-tolerant slug. Uniqueness is not enforced by the schema. */
export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return slug || "service";
}

export function mapCourseToService(course: StagedCourse, ctx: CourseMapContext): MapResult<ServiceRow> {
  const name = course.name?.trim();
  // The only hard requirement: business_services.name is NOT NULL and a nameless
  // service is not something a visitor could ever act on.
  if (!name) return { row: null, warnings: [], reason: "course has no name" };

  const warnings: string[] = [];

  const degreeLevelId = resolveRef(ctx.degreeLevels, course.degree_level, course.degree_level_code);
  if (!degreeLevelId && (course.degree_level || course.degree_level_code)) {
    warnings.push(`unmatched degree_level "${course.degree_level ?? course.degree_level_code}"`);
  }

  const areaOfStudyId = resolveRef(ctx.areasOfStudy, course.subject_area, course.subject_area_code);
  if (!areaOfStudyId && (course.subject_area || course.subject_area_code)) {
    warnings.push(`unmatched subject_area "${course.subject_area ?? course.subject_area_code}"`);
  }

  const studyModes: string[] = [];
  for (const part of (course.study_mode ?? "").split(/[,;/|]/)) {
    const mode = normalizeStudyMode(part);
    if (mode) {
      if (!studyModes.includes(mode)) studyModes.push(mode);
    } else if (part.trim()) {
      warnings.push(`unmatched study_mode "${part.trim()}"`);
    }
  }

  // International price is the headline figure for a directory of study options;
  // domestic is the fallback when the page only published one number.
  const price = course.international_fee_total ?? course.domestic_fee_total ?? null;
  const currency =
    (course.international_fee_total != null ? course.international_currency : course.domestic_currency) ??
    course.international_currency ??
    course.domestic_currency ??
    null;

  return {
    row: {
      extraction_source_id: course.id,
      name,
      slug: slugify(name),
      description: course.description ?? null,
      service_category_id: ctx.serviceCategoryId,
      degree_level_id: degreeLevelId,
      area_of_study_id: areaOfStudyId,
      duration_value: course.duration_weeks ?? null,
      duration_unit: course.duration_weeks != null ? "weeks" : null,
      study_mode: studyModes.length ? studyModes : null,
      price,
      price_currency: currency,
      price_type: "fixed",
      image_url: course.image_url ?? null,
      brochure_url: course.brochure_url ?? null,
      tags: course.career_paths?.length ? course.career_paths : null,
      is_published: ctx.publish,
      meta: JSON.stringify({
        extraction_job_id: ctx.jobId,
        extraction_course_id: course.id,
        source_url: course.source_url ?? null,
        short_name: course.short_name ?? null,
        awarding_institution: course.awarding_institution ?? null,
        verification_status: course.verification_status ?? null,
        course_status: course.course_status ?? null,
      }),
    },
    warnings,
  };
}

export interface StagedFee {
  id: string;
  name?: string | null;
  student_type?: string | null;
  period_type?: string | null;
  currency?: string | null;
  total_amount?: string | number | null;
  installments?: unknown;
  fee_type_id?: number | null;
}

export function mapFee(fee: StagedFee, serviceId: string): MapResult<Record<string, unknown>> {
  const studentType = normalizeStudentType(fee.student_type) ?? "both";
  return {
    row: {
      extraction_source_id: fee.id,
      service_id: serviceId,
      fee_type_id: fee.fee_type_id ?? null,
      name: fee.name ?? null,
      student_type: studentType,
      period_type: fee.period_type ?? null,
      currency: fee.currency ?? "AUD",
      total_amount: fee.total_amount ?? 0,
      installments: JSON.stringify(fee.installments ?? []),
    },
    warnings: fee.student_type && !normalizeStudentType(fee.student_type)
      ? [`unmatched student_type "${fee.student_type}"`]
      : [],
  };
}

export interface StagedIntake {
  id: string;
  intake_name?: string | null;
  start_date?: string | Date | null;
  end_date?: string | Date | null;
  orientation_date?: string | Date | null;
  admission_deadline?: string | Date | null;
  intake_month?: number | null;
  intake_year?: number | null;
}

export function mapIntake(intake: StagedIntake, serviceId: string): Record<string, unknown> {
  return {
    extraction_source_id: intake.id,
    service_id: serviceId,
    intake_name: intake.intake_name ?? null,
    start_date: intake.start_date ?? null,
    end_date: intake.end_date ?? null,
    orientation_date: intake.orientation_date ?? null,
    admission_deadline: intake.admission_deadline ?? null,
    intake_month: intake.intake_month ?? null,
    intake_year: intake.intake_year ?? null,
  };
}

export interface StagedEligibility {
  id: string;
  name?: string | null;
  applicable_to?: string | null;
  min_degree_level?: string | null;
  degree_level_id?: number | null;
  min_score_percent?: string | number | null;
  min_score_grade?: string | null;
  description?: string | null;
  academic_tests?: unknown;
  language_tests?: unknown;
  score_type?: string | null;
  min_score?: string | number | null;
}

export function mapEligibility(
  req: StagedEligibility,
  serviceId: string,
  degreeLevels: Map<string, number>,
): MapResult<Record<string, unknown>> {
  const warnings: string[] = [];
  const degreeLevelId = req.degree_level_id ?? resolveRef(degreeLevels, req.min_degree_level);
  if (!degreeLevelId && req.min_degree_level) {
    warnings.push(`unmatched min_degree_level "${req.min_degree_level}"`);
  }

  // Staging keeps a single (score_type, min_score) pair; the live column is a
  // jsonb list, so the pair becomes a one-element list rather than being lost.
  const minScores =
    req.score_type && req.min_score != null ? [{ score_type: req.score_type, min_score: req.min_score }] : [];

  return {
    row: {
      extraction_source_id: req.id,
      service_id: serviceId,
      name: req.name ?? null,
      applicable_to: normalizeApplicableTo(req.applicable_to) ?? "both",
      min_degree_level: req.min_degree_level ?? null,
      degree_level_id: degreeLevelId,
      min_score_percent: req.min_score_percent ?? null,
      min_score_grade: req.min_score_grade ?? null,
      min_grading_system: req.score_type ?? null,
      min_scores: JSON.stringify(minScores),
      description: req.description ?? null,
      academic_tests: JSON.stringify(req.academic_tests ?? []),
      language_tests: JSON.stringify(req.language_tests ?? []),
    },
    warnings,
  };
}

export interface StagedStudyOption {
  id: string;
  name?: string | null;
  study_mode?: string | null;
  study_load?: string | null;
  duration_value?: number | null;
  duration_unit?: string | null;
  applicable_to?: string | null;
}

export function mapStudyOption(option: StagedStudyOption): MapResult<Record<string, unknown>> {
  // Every one of these columns is CHECK-constrained live, so a value that does not
  // map would either abort the promote transaction or be silently defaulted. A
  // *present but unmappable* value is refused and reported. A *missing* one falls
  // back to the column default both schemas already declare — except study_mode,
  // which visitors filter on and which is not safe to invent.
  const studyMode = normalizeStudyMode(option.study_mode);
  if (!studyMode) return { row: null, warnings: [], reason: `unmatched study_mode "${option.study_mode ?? ""}"` };

  const studyLoad = option.study_load?.trim() ? normalizeStudyLoad(option.study_load) : "full_time";
  if (!studyLoad) return { row: null, warnings: [], reason: `unmatched study_load "${option.study_load}"` };

  const applicableTo = option.applicable_to?.trim() ? normalizeApplicableTo(option.applicable_to) : "both";
  if (!applicableTo) {
    return { row: null, warnings: [], reason: `unmatched applicable_to "${option.applicable_to}"` };
  }

  const durationUnit = option.duration_unit ? normalizeDurationUnit(option.duration_unit) : null;
  if (option.duration_unit && !durationUnit) {
    return { row: null, warnings: [], reason: `unmatched duration_unit "${option.duration_unit}"` };
  }

  return {
    row: {
      extraction_source_id: option.id,
      name: option.name ?? null,
      study_mode: studyMode,
      study_load: studyLoad,
      duration_value: option.duration_value ?? null,
      duration_unit: durationUnit,
      applicable_to: applicableTo,
    },
    warnings: [],
  };
}

export interface StagedStudyUnit {
  id: string;
  unit_code?: string | null;
  unit_name: string | null;
  credit_points?: number | null;
  description?: string | null;
  unit_type?: string | null;
}

export function mapStudyUnit(unit: StagedStudyUnit): MapResult<Record<string, unknown>> {
  const unitName = unit.unit_name?.trim();
  if (!unitName) return { row: null, warnings: [], reason: "study unit has no name" };
  return {
    row: {
      extraction_source_id: unit.id,
      unit_code: unit.unit_code ?? null,
      unit_name: unitName,
      credit_points: unit.credit_points ?? null,
      description: unit.description ?? null,
    },
    warnings: [],
  };
}

/** Domain used to match an extracted institution against an existing org row. */
export function websiteHost(url: string | null | undefined): string | null {
  if (!url) return null;
  const candidate = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  try {
    return new URL(candidate).hostname.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}
