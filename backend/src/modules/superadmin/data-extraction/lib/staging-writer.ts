// Writes LLM-extracted data to the staging tables with proper relationships.

import { masterKnex } from "../../../../core/db/master-pool.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";
import { parseInstallments, type Installment } from "./installment-parser.js";
import { loadLookupLists, resolveAreaOfStudy, resolveDegreeLevel } from "./lookup-catalog.js";

const logger = createChildLogger("staging-writer");
/** Every course's lookup binding lands here, linked or not; the verify worker totals them per job. */
const linkLogger = createChildLogger("lookup-link");

// ── Types matching LLM output ──

export interface ExtractedCourse {
  name: string;
  short_name?: string | null;
  degree_level?: string | null;
  /** LLM-classified per course, not inherited from the job's service_category_id — a job
   * scoped to "Academic Courses" still surfaces short courses on the same pages. */
  course_category?: string | null;
  subject_area?: string | null;
  /** The model's pick from the 14 platform areas — validated against the list, never stored raw. */
  area_of_study?: string | null;
  /** LLM output isn't schema-enforced — usually a number, sometimes "3 years" (resolveDurationWeeks handles both). */
  duration_weeks?: number | string | null;
  /** Duration verbatim from the page ("3 years full-time") — parsed when the model left duration_weeks null; not persisted. */
  duration_text?: string | null;
  study_mode?: string | null;
  description?: string | null;
  awarding_institution?: string | null;
  source_url?: string | null;
  /** ISO2 from site intelligence, resolved against public.countries — the worker passes it, never the model. */
  country_code?: string | null;
  career_paths?: string[] | null;
  fees?: ExtractedFee[];
  intakes?: ExtractedIntake[];
  study_options?: ExtractedStudyOption[];
  eligibility?: ExtractedEligibility[];
  english_requirements?: ExtractedEnglishReq[];
  campus_names?: string[];
  study_units?: ExtractedStudyUnit[];
  /** LLM-flagged link to this course's own curriculum page — routing only, not persisted. */
  curriculum_page_url?: string | null;
  /** LLM-flagged link to this course's own fees/tuition page — routing only, not persisted. */
  fees_page_url?: string | null;
}

export interface ExtractedStudyUnit {
  unit_code?: string | null;
  unit_name: string;
  credit_points?: number | null;
}

export interface ExtractedFee {
  /** Short label only ("Tuition Fee", "Semester Fee") — the page's own wording goes in description. */
  name?: string | null;
  description?: string | null;
  student_type?: string;
  period_type?: string;
  currency?: string | null;
  /** LLM output isn't schema-enforced (responseMimeType: json only) — often a plain number, but a
   * range ("$25,000-$30,000") or unparseable text ("Contact us") arrives as a string. */
  total_amount?: number | string | null;
}

export interface ExtractedIntake {
  intake_name?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  intake_month?: number | string | null;
  intake_year?: number | string | null;
  admission_deadline?: string | null;
}

// ponytail: LLM sometimes returns "September" instead of 9
const MONTH_NAMES: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function coerceMonth(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return v >= 1 && v <= 12 ? v : null;
  const s = String(v).trim().toLowerCase();
  const n = Number(s);
  if (!isNaN(n) && n >= 1 && n <= 12) return n;
  return MONTH_NAMES[s] ?? null;
}

// ponytail: LLM emits "February 15" / "Feb 2026" for date columns — ISO or null, nothing else.
// A string with no year ("February 15") is not a date; the month still survives via intake_month.
export function coerceDate(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  const iso = s.match(/^(\d{4})-\d{2}-\d{2}/);
  if (iso) return iso[1] === "0000" ? null : iso[0];
  if (!/\d{4}/.test(s)) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  // Local date parts, not toISOString(): non-ISO strings parse as local midnight,
  // and the UTC rendering shifts them a day in any timezone ahead of UTC.
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function coerceInt(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return isNaN(n) ? null : Math.floor(n);
}

// ponytail: takes the lower bound of a range/currency-symbol string ("$25,000-$30,000" -> 25000);
// the full original text still survives in the fee's own name. Doesn't handle "25k"-style shorthand
// — add that if a real page needs it. Never falls back to 0: an unparseable fee must stay null, not
// look like a real $0 tuition figure.
/** LLM output isn't schema-enforced — clamp free-text drift ("Academic", "Short Course") to
 * the two values the pipeline actually stores/filters on; anything unrecognised is left null
 * rather than guessed. */
export function normaliseCourseCategory(v: unknown): "academic" | "short_course" | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (s === "academic") return "academic";
  if (s === "short_course" || s === "short_courses") return "short_course";
  return null;
}

export function coerceMoney(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return isNaN(v) ? null : v;
  const match = String(v).replace(/,/g, "").match(/\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

const SCORE_TYPES = ["percentage", "gpa_4", "gpa_10", "cgpa"] as const;
type ScoreType = (typeof SCORE_TYPES)[number];

export function normaliseScoreType(v: unknown): ScoreType | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  return (SCORE_TYPES as readonly string[]).includes(s) ? (s as ScoreType) : null;
}

// ponytail: same LLM-drift guard as coerceMoney — a score stated plainly in the
// description ("GPA of 3.0") but missing from score_type/min_score. Bare "GPA of X"
// defaults to a 4.0 scale (the common convention) unless the text names a different one.
export function deriveScoreFromDescription(description: string | null | undefined): { score_type: ScoreType; value: number } | null {
  if (!description) return null;
  const patterns: { type: ScoreType; re: RegExp }[] = [
    { type: "percentage", re: /(\d+(?:\.\d+)?)\s*(?:%|percent)/i },
    { type: "cgpa", re: /cgpa[^\d]{0,10}(\d+(?:\.\d+)?)/i },
    { type: "gpa_10", re: /gpa[^\d]{0,10}(\d+(?:\.\d+)?)\s*(?:\/|out of)\s*10(?:\.0)?\b/i },
    { type: "gpa_4", re: /gpa[^\d]{0,10}(\d+(?:\.\d+)?)\s*(?:\/|out of)\s*4(?:\.0)?\b/i },
    { type: "gpa_4", re: /gpa[^\d]{0,10}(\d+(?:\.\d+)?)/i },
  ];
  for (const { type, re } of patterns) {
    const m = description.match(re);
    if (m) return { score_type: type, value: Number(m[1]) };
  }
  return null;
}

export interface ExtractedStudyOption {
  name?: string | null;
  study_mode?: string | null;
  study_load?: string | null;
  duration_value?: number | string | null;
  duration_unit?: string | null;
  /** Duration verbatim for this option ("2 years part-time") — parsed when duration_value is null. */
  duration_text?: string | null;
}

export interface ExtractedEligibility {
  name?: string | null;
  applicable_to?: string;
  description?: string | null;
  min_score_percent?: number | null;
  min_degree_level?: string | null;
  score_type?: string | null;
  min_score?: number | string | null;
}

export interface ExtractedEnglishReq {
  test_type_name?: string | null;
  overall_score?: string | null;
  listening_score?: string | null;
  reading_score?: string | null;
  writing_score?: string | null;
  speaking_score?: string | null;
}

export interface ExtractedCampus {
  name?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface InstitutionOverview {
  name?: string | null;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  description?: string | null;
  logo_url?: string | null;
  source_url?: string | null;
  zip_code?: string | null;
  facebook_url?: string | null;
  instagram_url?: string | null;
  twitter_url?: string | null;
  linkedin_url?: string | null;
  youtube_url?: string | null;
}

export interface SiteIntelligence {
  institution_name?: string | null;
  institution_type?: string | null;
  country?: string | null;
  currency?: string | null;
  fee_structure?: Record<string, unknown>;
  extraction_hints?: string[];
  navigation_patterns?: Record<string, unknown>;
}

// ── Writers ──
const OVERVIEW_MERGE_COLUMNS = [
  "name", "website", "phone", "email", "address", "city", "state", "country",
  "description", "logo_url", "source_url", "zip_code",
  "facebook_url", "instagram_url", "twitter_url", "linkedin_url", "youtube_url",
] as const;

export async function writeInstitutionOverview(jobId: string, data: InstitutionOverview) {
  const mergeSet: Record<string, unknown> = { updated_at: masterKnex.fn.now() };
  for (const col of OVERVIEW_MERGE_COLUMNS) {
    mergeSet[col] = masterKnex.raw(
      `COALESCE(NULLIF(EXCLUDED.${col}, ''), ${S}.extraction_institution_overview.${col})`,
    );
  }
  const [row] = await masterKnex(`${S}.extraction_institution_overview`)
    .insert({ job_id: jobId, ...data })
    .onConflict("job_id")
    .merge(mergeSet)
    .returning("id");
  logger.info("Upserted institution overview", { jobId, id: row.id });
  return row;
}

export async function writeSiteIntelligence(jobId: string, data: SiteIntelligence) {
  const insert: Record<string, unknown> = {
    job_id: jobId,
    institution_name: data.institution_name,
    institution_type: data.institution_type,
    country: data.country,
    currency: data.currency,
  };
  if (data.fee_structure) insert.fee_structure = JSON.stringify(data.fee_structure);
  if (data.extraction_hints) insert.extraction_hints = data.extraction_hints;
  if (data.navigation_patterns) insert.navigation_patterns = JSON.stringify(data.navigation_patterns);

  const [row] = await masterKnex(`${S}.extraction_site_intelligence`).insert(insert).returning("id");
  logger.info("Wrote site intelligence", { jobId, id: row.id });
  return row;
}

// ponytail: LLM returns "Sydney", "Sydney Campus", "sydney" — normalize to match
export function normaliseCampusName(name: string): string {
  return name.trim().toLowerCase()
    .replace(/\s+campus$/i, "")
    .replace(/\s+/g, " ");
}

/**
 * Upsert a campus for a job — deduplicates by normalised name within the same job.
 */
export async function upsertCampus(jobId: string, campus: ExtractedCampus): Promise<string> {
  if (!campus.name) return "";

  const allCampuses = await masterKnex(`${S}.extraction_campuses`)
    .where({ job_id: jobId });

  const norm = normaliseCampusName(campus.name);
  const existing = allCampuses.find(c => normaliseCampusName(c.name) === norm);

  if (existing) return existing.id;

  const [row] = await masterKnex(`${S}.extraction_campuses`)
    .insert({ job_id: jobId, ...campus })
    .returning("id");
  return row.id;
}

// ── Duration ─────────────────────────────────────────────────────────────────

export type DurationUnit = "days" | "weeks" | "months" | "years" | "semesters";

export function normaliseDurationUnit(v: unknown): DurationUnit | null {
  if (typeof v !== "string") return null;
  const s = v.toLowerCase();
  if (/^day/.test(s)) return "days";
  if (/^w(ee)?k/.test(s)) return "weeks";
  if (/^mo/.test(s)) return "months";
  if (/^y(ea)?r/.test(s)) return "years";
  if (/^(semester|term|trimester)/.test(s)) return "semesters";
  return null;
}

export function normaliseStudyLoad(v: unknown): "full_time" | "part_time" | null {
  if (typeof v !== "string") return null;
  const s = v.toLowerCase();
  if (/\b(part[- ]?time|pt)\b/.test(s)) return "part_time";
  if (/\b(full[- ]?time|ft)\b/.test(s)) return "full_time";
  return null;
}

/**
 * "3 years", "18 months", "2 years full-time / 4 years part-time" (first figure), "1.5 years",
 * "52 weeks", "4 semesters", "3-4 years" (lower bound), "three years". Null when no figure.
 */
export function parseDurationText(text: unknown): { value: number; unit: DurationUnit } | null {
  if (typeof text !== "string") return null;
  const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, eighteen: 18 };
  const s = text.toLowerCase().replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|twelve|eighteen)\b/g, (w) => String(words[w]));
  const m = s.match(/(\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*\d+(?:\.\d+)?)?\s*(days?|weeks?|wks?|months?|mos?|years?|yrs?|semesters?|terms?|trimesters?)\b/);
  if (!m) return null;
  const value = Number(m[1]);
  const unit = normaliseDurationUnit(m[2]);
  if (!unit || !(value > 0)) return null;
  return { value, unit };
}

/** Same conversions the prompt states: 1 year = 52 weeks, 1 semester = 26 weeks. */
export function durationToWeeks(value: number | null | undefined, unit: DurationUnit | null | undefined): number | null {
  if (value == null || !unit) return null;
  const perUnit: Record<DurationUnit, number> = { days: 1 / 7, weeks: 1, months: 52 / 12, years: 52, semesters: 26 };
  const weeks = Math.round(value * perUnit[unit]);
  return weeks > 0 ? weeks : null;
}

// ponytail: a course longer than 10 years or shorter than a week is a unit mix-up, not a course.
const MAX_COURSE_WEEKS = 520;

function plausibleWeeks(weeks: number | null): number | null {
  return weeks != null && weeks >= 1 && weeks <= MAX_COURSE_WEEKS ? weeks : null;
}

/**
 * A course's duration in prose ("The programme is delivered over three years full-time",
 * "a two-year MSc", "Duration: 18 months"). Unlike parseDurationText this only trusts a
 * figure that sits next to a duration cue — a description also mentions "two years of work
 * experience" and "a 10-week placement", which are not the course length.
 */
export function durationFromProse(text: unknown): { value: number; unit: DurationUnit } | null {
  if (typeof text !== "string" || !text) return null;
  const num = "(\\d+(?:\\.\\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|twelve|eighteen)";
  const unit = "(days?|weeks?|months?|years?|semesters?|terms?|trimesters?)";
  const cues: RegExp[] = [
    // "three-year programme", "2 year full-time course", "18-month MSc"
    new RegExp(`\\b${num}[- ]${unit}(?:,? full[- ]time| part[- ]time)? (?:programme|program|course|degree|masters?|bachelors?|diploma|certificate|phd|doctorate|study|studies|msc|ma|mba|mres|mphil|meng|llm|bsc|ba|beng|llb|pgcert|pgdip|honou?rs)\\b`, "i"),
    // "duration: 3 years", "length of programme 2 years", "lasts 18 months", "delivered over three years", "completed in two years"
    new RegExp(`\\b(?:duration|length|lasts?|delivered over|studied over|taken over|spread over|completed? (?:in|over|within)|takes)\\b[^.\\d]{0,40}?${num}[- ]?${unit}\\b`, "i"),
    // "3 years full-time", "two years (full-time)"
    new RegExp(`\\b${num}[- ]?${unit}\\s*\\(?(?:of )?(?:full|part)[- ]time`, "i"),
  ];
  for (const re of cues) {
    const m = text.match(re);
    if (m) {
      const parsed = parseDurationText(`${m[1]} ${m[2]}`);
      if (parsed) return parsed;
    }
  }
  return null;
}

/**
 * One resolver for duration_weeks, most reliable source first:
 *  1. duration_text (verbatim from the page) — the model's arithmetic is the weak link;
 *  2. the model's numeric duration_weeks, or that field when it came back as text ("3 years");
 *  3. the shortest full-time study option, then any option, with a stated duration;
 *  4. a duration cue in the description.
 * Audit 2026-09-04: only 221 of 1,918 staged courses had a duration, while 126 of the empty
 * ones had a study option that stated it and the writer never looked there.
 */
export function resolveDurationWeeks(course: Pick<ExtractedCourse, "duration_weeks" | "duration_text" | "study_options" | "description">): number | null {
  const fromText = parseDurationText(course.duration_text);
  if (fromText) return plausibleWeeks(durationToWeeks(fromText.value, fromText.unit));

  const numeric = coerceInt(course.duration_weeks);
  if (numeric != null) return plausibleWeeks(numeric);
  if (typeof course.duration_weeks === "string") {
    const p = parseDurationText(course.duration_weeks);
    if (p) return plausibleWeeks(durationToWeeks(p.value, p.unit));
  }

  const fromOptions = weeksFromStudyOptions(course.study_options);
  if (fromOptions) return fromOptions;

  const prose = durationFromProse(course.description);
  return prose ? plausibleWeeks(durationToWeeks(prose.value, prose.unit)) : null;
}

/** Shortest full-time option's duration, else shortest of any option — the standard length. */
export function weeksFromStudyOptions(options: ExtractedStudyOption[] | null | undefined): number | null {
  if (!options?.length) return null;
  const weeks = options.map((o) => {
    let value = coerceMoney(o.duration_value);
    let unit = normaliseDurationUnit(o.duration_unit);
    if (value == null || !unit) {
      const p = parseDurationText(o.duration_text) ?? parseDurationText(o.name);
      if (p) { value = p.value; unit = p.unit; }
    }
    const load = normaliseStudyLoad(o.study_load) ?? normaliseStudyLoad(o.name) ?? normaliseStudyLoad(o.duration_text);
    return { weeks: plausibleWeeks(durationToWeeks(value, unit)), load };
  }).filter((x): x is { weeks: number; load: "full_time" | "part_time" | null } => x.weeks != null);
  if (!weeks.length) return null;
  const fullTime = weeks.filter((x) => x.load === "full_time");
  const pool = fullTime.length ? fullTime : weeks;
  return Math.min(...pool.map((x) => x.weeks));
}

// ponytail: same shape as normaliseCampusName — LLM re-extracts the same unit with
// slightly different casing/whitespace across course pages and job re-runs
export function normaliseUnitName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Upsert a study unit for a job — deduplicates by normalised unit_name within the same
 * job, mirroring upsertCampus. Without this, every course extraction (including re-runs)
 * inserted a fresh extraction_study_units row for the same unit shared across courses.
 */
export async function upsertStudyUnit(jobId: string, unit: ExtractedStudyUnit): Promise<string> {
  const norm = normaliseUnitName(unit.unit_name);
  // Same normalisation on both sides as normaliseUnitName() — it collapses internal whitespace
  // runs, which a bare LOWER(TRIM()) does not, so a unit name carrying a double space or a
  // newline never matched itself and was inserted again. (Same bug class as the course dedup.)
  const existing = await masterKnex(`${S}.extraction_study_units`)
    .where({ job_id: jobId })
    .whereRaw("regexp_replace(lower(trim(unit_name)), '\\s+', ' ', 'g') = ?", [norm])
    .first();
  if (existing) return existing.id;

  const [row] = await masterKnex(`${S}.extraction_study_units`)
    .insert({
      job_id: jobId,
      unit_code: unit.unit_code ?? null,
      unit_name: unit.unit_name,
      credit_points: coerceInt(unit.credit_points),
    })
    .returning("id");
  return row.id;
}

// ── Fee normalisation ──
// The LLM writes whatever the page showed: "$", "", "null", "per_term", "Per Credit". Both
// normalisers run inside upsertFee so every write path (course extraction, the bulk fee
// matcher, per-course re-extraction, AgentCIS import) gets the same canonical values — and so
// the dedupe key below stops splitting on spelling.

const PERIOD_TYPES: Record<string, string> = {
  "per year": "Per Year", year: "Per Year", yearly: "Per Year", annual: "Per Year",
  annually: "Per Year", "per annum": "Per Year",
  "per semester": "Per Semester", semester: "Per Semester",
  "per term": "Per Term", term: "Per Term", termly: "Per Term",
  "per week": "Per Week", week: "Per Week", weekly: "Per Week", "per week of study": "Per Week",
  "per trimester": "Per Trimester", trimester: "Per Trimester",
  "per unit": "Per Unit", unit: "Per Unit", "per credit": "Per Unit", credit: "Per Unit",
  "per credit hour": "Per Unit", "credit hour": "Per Unit", "per subject": "Per Unit",
  "per module": "Per Unit", "per course": "Per Unit",
  total: "Total", "total cost": "Total", "total fee": "Total", "whole course": "Total",
  "full course": "Total", program: "Total", programme: "Total", "one off": "Total",
};

/** Canonical period_type (the frontend's PERIOD_TYPE_OPTIONS). Unrecognised text is kept as-is
 * rather than guessed — an operator can still see and fix it in the fees tab. */
export function normalisePeriodType(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "Per Year";
  return PERIOD_TYPES[s.toLowerCase().replace(/_/g, " ")] ?? s;
}

const CURRENCY_UNKNOWN = new Set(["", "null", "n/a", "na", "none", "unknown", "-"]);

// ponytail: public.countries is ~200 static rows — read once per process, not per fee.
let currencyRefCache: {
  codes: Set<string>;
  bySymbol: Map<string, string>;
  symbolsFor: Map<string, Set<string>>;
  allSymbols: Set<string>;
} | null = null;

async function currencyRef() {
  if (currencyRefCache) return currencyRefCache;
  const rows: Array<{ currency: string | null; currency_symbol: string | null }> =
    await masterKnex("public.countries").select("currency", "currency_symbol");
  const codes = new Set<string>();
  const symbolCurrencies = new Map<string, Set<string>>();
  const symbolsFor = new Map<string, Set<string>>();
  for (const r of rows) {
    const code = r.currency?.trim().toUpperCase();
    if (!code) continue;
    codes.add(code);
    const symbol = r.currency_symbol?.trim();
    if (!symbol) continue;
    if (!symbolCurrencies.has(symbol)) symbolCurrencies.set(symbol, new Set());
    symbolCurrencies.get(symbol)!.add(code);
    if (!symbolsFor.has(code)) symbolsFor.set(code, new Set());
    symbolsFor.get(code)!.add(symbol);
  }
  // "$" is 20+ currencies — only a symbol that means exactly one currency can resolve on its own.
  const bySymbol = new Map<string, string>();
  for (const [symbol, set] of symbolCurrencies) {
    if (set.size === 1) bySymbol.set(symbol, [...set][0]!);
  }
  currencyRefCache = { codes, bySymbol, symbolsFor, allSymbols: new Set(symbolCurrencies.keys()) };
  return currencyRefCache;
}

const jobCurrencyCache = new Map<string, string | null>();

/** The currency of the institution's own country — what "$" means on this job's pages. */
async function jobCurrency(jobId: string): Promise<string | null> {
  const cached = jobCurrencyCache.get(jobId);
  if (cached !== undefined) return cached;
  const intel = await masterKnex(`${S}.extraction_site_intelligence`)
    .select("currency", "country")
    .where({ job_id: jobId })
    .orderBy("created_at", "desc")
    .first();
  const { codes } = await currencyRef();
  let resolved: string | null = null;
  const stated = intel?.currency?.trim().toUpperCase();
  if (stated && codes.has(stated)) {
    resolved = stated;
  } else if (intel?.country?.trim()) {
    // Site intelligence writes whatever the page said — in practice an ISO code ("US"), but a
    // full name reads just as naturally, so match against all three columns.
    const country = intel.country.trim().toLowerCase();
    const row = await masterKnex("public.countries")
      .select("currency")
      .whereRaw("lower(btrim(name)) = ? OR lower(iso2) = ? OR lower(iso3) = ?", [country, country, country])
      .first();
    resolved = row?.currency ?? null;
  }
  jobCurrencyCache.set(jobId, resolved);
  return resolved;
}

/** ISO 4217 code from whatever the page showed — a code, a code buried in text ("AUD $"), or a
 * symbol resolved against the job's country. Null when it stays genuinely unknown. */
export async function normaliseCurrency(raw: string | null | undefined, jobId: string): Promise<string | null> {
  const s = String(raw ?? "").trim();
  const { codes, bySymbol, symbolsFor, allSymbols } = await currencyRef();
  const upper = s.toUpperCase();
  if (codes.has(upper)) return upper;
  if (CURRENCY_UNKNOWN.has(upper.toLowerCase())) return jobCurrency(jobId);
  const embedded = upper.match(/[A-Z]{3}/)?.[0];
  if (embedded && codes.has(embedded)) return embedded;

  const unambiguous = bySymbol.get(s);
  if (unambiguous) return unambiguous;
  const job = await jobCurrency(jobId);
  // "$" on a US institution's page is USD. "£" on that same page is not — an ambiguous symbol
  // that the job's own currency doesn't use stays unknown rather than being quietly relabelled.
  if (job && symbolsFor.get(job)?.has(s)) return job;
  return allSymbols.has(s) ? null : job;
}

/**
 * Upsert a fee for a job — deduplicates by (student_type, period_type, currency, total_amount)
 * within the same job so a shared rate (e.g. "$325/credit for all programs") creates ONE row
 * linked to multiple courses via extraction_course_fee_assignments, not one identical row per
 * course. Name is excluded from the key because LLM wording varies across pages.
 */
export async function upsertFee(jobId: string, fee: {
  name?: string | null;
  description?: string | null;
  student_type: string;
  period_type: string;
  currency?: string | null;
  total_amount?: number | null;
  /** The workers' duration-aware split; upsertFee derives one from the period when absent. */
  installments?: Installment[] | null;
}): Promise<string> {
  const currency = await normaliseCurrency(fee.currency, jobId);
  const periodType = normalisePeriodType(fee.period_type);
  const name = feeLabel(fee.name, periodType);
  // The page's own wording, kept out of the label — an explicit description wins, else a name
  // that was really a blob of page text ("$1,090 per credit 33 total credits …").
  const description = fee.description?.trim()
    || (fee.name && fee.name.trim() !== name ? fee.name.trim() : null);

  const q = masterKnex(`${S}.extraction_course_fees`)
    .where({ job_id: jobId, student_type: fee.student_type, period_type: periodType });
  if (currency != null) q.where({ currency }); else q.whereNull("currency");
  if (fee.total_amount != null) q.where({ total_amount: fee.total_amount }); else q.whereNull("total_amount");
  const existing = await q.first();
  if (existing) {
    // Whichever page was scraped first wins the row, but not the metadata: a later page that
    // carries the fee's wording (or any name at all) fills what the first one left blank.
    const fill: Record<string, unknown> = {};
    if (description && !existing.description) fill.description = description;
    if (name && !existing.name) fill.name = name;
    if (Object.keys(fill).length > 0) {
      await masterKnex(`${S}.extraction_course_fees`)
        .where({ id: existing.id })
        .update({ ...fill, updated_at: masterKnex.fn.now() });
    }
    return existing.id as string;
  }

  const [row] = await masterKnex(`${S}.extraction_course_fees`)
    .insert({
      job_id: jobId,
      name,
      description,
      student_type: fee.student_type,
      period_type: periodType,
      currency,
      total_amount: fee.total_amount ?? null,
      installments: JSON.stringify(feeBreakdown({ ...fee, period_type: periodType, name })),
    })
    .returning("id");
  return row.id as string;
}

// public.fee_types holds the 8 global types the fee form's dropdown offers. An installment line
// has to name one of them, so a fee's own label is matched onto the closest — an extracted
// "Health Cover" is a Health Insurance Fee, and anything unrecognised is tuition.
const FEE_TYPE_KEYWORDS: Array<[RegExp, string]> = [
  [/applicat/i, "Application Fee"],
  [/enrol|registration/i, "Enrollment Fee"],
  [/material|book|equipment|resource/i, "Material Fee"],
  [/exam|assessment/i, "Exam Fee"],
  [/late/i, "Late Payment Fee"],
  [/insurance|health|oshc|cover/i, "Health Insurance Fee"],
  [/student services|amenit|ssaf/i, "Student Services Fee"],
];

export function feeTypeFor(name: string | null | undefined): string {
  for (const [re, type] of FEE_TYPE_KEYWORDS) if (re.test(name ?? "")) return type;
  return "Tuition Fee";
}

/**
 * The installment breakdown in the shape the fee form reads and writes: every installment carries
 * at least one {fee_type, amount} line.
 *
 * Without this a fee stored as a bare total opens in the form as an empty "Semester 1" worth 0 —
 * no fee type selected, "Total Fees USD 0" — and saving that overwrites the real amount with zero.
 * `existing` is the duration-aware split the workers compute; everything else falls back to
 * parseInstallments on the period alone.
 */
export function feeBreakdown(fee: {
  name?: string | null;
  period_type: string;
  total_amount?: number | null;
  installments?: Installment[] | null;
}): Array<Installment & { lines: Array<{ fee_type: string; amount: number }> }> {
  const total = fee.total_amount ?? 0;
  if (total <= 0) return [];
  const parts = fee.installments?.length
    ? fee.installments
    : parseInstallments({ totalAmount: total, periodType: fee.period_type });
  const feeType = feeTypeFor(fee.name);
  return parts.map((i) => ({
    ...i,
    lines: i.lines?.length ? i.lines : [{ fee_type: feeType, amount: i.amount }],
  }));
}

const GENERIC_FEE_LABEL: Record<string, string> = {
  "Per Year": "Annual Tuition Fee",
  "Per Semester": "Semester Fee",
  "Per Trimester": "Trimester Fee",
  "Per Unit": "Per Credit Fee",
  "Total": "Total Program Fee",
};

/** A fee label a human would read in a fee table. The LLM is asked for one, but still sends the
 * whole page line often enough ("$1,090 per credit 33 total credits $35,970 total cost") — any
 * name carrying figures falls back to its own leading heading, then to the period's generic name. */
export function feeLabel(raw: string | null | undefined, periodType: string): string {
  const generic = GENERIC_FEE_LABEL[periodType] ?? "Tuition Fee";
  const s = (raw ?? "").trim();
  if (!s) return generic;
  if (!/\d/.test(s) && s.length <= 60) return s;
  // A heading is only a label if it stands on its own — no figures, and no bracket left open
  // by the split ("Tuition (range: $25,000-$30,000)").
  const heading = s.split(":")[0]!.trim();
  if (heading !== s && !/[\d([]/.test(heading) && heading.length >= 3 && heading.length <= 60) return heading;
  return generic;
}

/**
 * Normalise a course name for dedup: lowercase, collapse whitespace, strip degree
 * prefixes that the LLM sometimes includes inconsistently.
 */
export function normaliseCourseName(name: string): string {
  return name.trim().toLowerCase()
    .replace(/\s+/g, " ")
    // "Bachelor of Science in Computer Science" and "Computer Science (Bachelor)" should NOT dedup —
    // but "Bachelor of Computer Science" on two different pages should. Strip only trailing junk.
    .replace(/[^a-z0-9]+$/g, "");
}

/**
 * Write a full course with all its child entities and junction assignments.
 * Deduplicates by normalised name within the same job — if a course already exists,
 * merges richer data into the existing row and attaches new child entities.
 * Returns the course ID.
 */
export interface CourseLookupLink {
  /** public.degree_levels.name, or null when the course names no level on the platform list. */
  degree_level: string | null;
  /** public.degree_levels.slug — the link. null = unlinked. */
  degree_level_code: string | null;
  /**
   * public.areas_of_study.slug — the link. null = unlinked. The subject text itself is stored as
   * the model wrote it: `subject_area` is free description, the AREA is what a course links to.
   */
  subject_area_code: string | null;
}

/**
 * Bind a course onto the platform's closed lists. The lists come from the database (seeded from
 * database/seeders/globalyapp/*_seeder.ts) and are cached per process, so this is effectively free
 * after the first call and makes no model call of its own — the model already chose `area_of_study`
 * and `degree_level` while reading the page; this validates those choices against the live list.
 */
export async function resolveCourseLookups(course: ExtractedCourse): Promise<CourseLookupLink> {
  const lists = await loadLookupLists();
  const level = resolveDegreeLevel(lists, course.degree_level, course.name);
  // Subject wording first, then the course's own name — "Bachelor of Nursing" still reaches Health
  // and Medicine on a page that never stated a subject.
  const area = resolveAreaOfStudy(lists, course.area_of_study, course.subject_area, course.name);
  return {
    degree_level: level?.name ?? null,
    degree_level_code: level?.slug ?? null,
    subject_area_code: area?.slug ?? null,
  };
}

/**
 * The link log. One line per course written, so "is this course linked to a subject area and a
 * degree level?" is answerable from the worker output alone: `warn` when either side failed to
 * match (with the raw text that didn't), `info` when both landed. The DB-wide view of the same
 * question is the verify worker's `lookup_links_verified` job event.
 */
function logLookupLink(jobId: string, courseId: string, course: ExtractedCourse, link: CourseLookupLink) {
  const entry = {
    jobId, courseId, course: course.name,
    degree_level: link.degree_level_code
      ? { linked: true, raw: course.degree_level ?? null, name: link.degree_level, slug: link.degree_level_code }
      : { linked: false, raw: course.degree_level ?? null },
    subject_area: link.subject_area_code
      ? { linked: true, subject: course.subject_area ?? null, area_pick: course.area_of_study ?? null, slug: link.subject_area_code }
      : { linked: false, subject: course.subject_area ?? null, area_pick: course.area_of_study ?? null },
  };
  if (link.degree_level_code && link.subject_area_code) linkLogger.info("linked", entry);
  else linkLogger.warn("unlinked", entry);
}

export async function writeCourse(jobId: string, course: ExtractedCourse, campusIdMap: Map<string, string>): Promise<string> {
  // ── Dedup: check if this course name already exists for this job ──
  // Both sides MUST apply the same normalisation as normaliseCourseName(). A bare
  // LOWER(TRIM(name)) keeps the trailing ")" that the JS side strips, so "Nursing BSc (Hons)"
  // compared "nursing bsc (hons)" against "nursing bsc (hons" and never matched itself — every
  // re-extraction of a bracket-suffixed course (…(Hons), …(BSAsE), …(PhD) — most of a catalogue)
  // inserted a DUPLICATE row instead of merging, so one copy carried the lookup links and the
  // other did not. Caught by the end-to-end linking check.
  const normName = normaliseCourseName(course.name);
  const existing = await masterKnex(`${S}.extraction_courses`)
    .where({ job_id: jobId })
    .whereRaw(
      "regexp_replace(regexp_replace(lower(trim(name)), '\\s+', ' ', 'g'), '[^a-z0-9]+$', '') = ?",
      [normName],
    )
    .first();

  let courseId: string;

  // ── Bind to the platform's closed lookup lists ──
  // The link is the *_code column: degree_level_code = public.degree_levels.slug,
  // subject_area_code = public.areas_of_study.slug. Deterministic, no model call. A value that
  // matches nothing leaves the code null — the course stays unlinked and shows up in the link
  // log and the verify worker's link check rather than being guessed at or inventing a lookup row.
  const link = await resolveCourseLookups(course);

  if (existing) {
    courseId = existing.id;
    // Merge: fill nulls on the existing row with data from this extraction
    const updates: Record<string, unknown> = {};
    const mergeFields: Array<keyof ExtractedCourse> = [
      "short_name", "course_category", "subject_area", "duration_weeks",
      "study_mode", "description", "awarding_institution",
      "source_url", "country_code",
    ];
    for (const field of mergeFields) {
      const newVal = field === "duration_weeks" ? resolveDurationWeeks(course)
        : field === "course_category" ? normaliseCourseCategory(course[field])
        : (course[field] ?? null);
      if (newVal != null && newVal !== "" && (existing[field] == null || existing[field] === "")) {
        updates[field] = newVal;
      }
    }
    // A later page that names the qualification beats an earlier row that couldn't be linked;
    // an existing link is never overwritten.
    if (link.degree_level && existing.degree_level_code == null) {
      updates.degree_level = link.degree_level;
      updates.degree_level_code = link.degree_level_code;
    }
    if (link.subject_area_code && existing.subject_area_code == null) {
      updates.subject_area_code = link.subject_area_code;
    }
    if (course.career_paths?.length && (!existing.career_paths || existing.career_paths.length === 0)) {
      updates.career_paths = course.career_paths;
    }
    if (Object.keys(updates).length > 0) {
      updates.updated_at = masterKnex.fn.now();
      await masterKnex(`${S}.extraction_courses`).where({ id: courseId }).update(updates);
      logger.info("Merged duplicate course", { jobId, courseId, name: course.name, fieldsUpdated: Object.keys(updates).length - 1 });
    } else {
      logger.info("Skipped duplicate course (no new data)", { jobId, courseId, name: course.name });
    }
    logLookupLink(jobId, courseId, course, {
      ...link,
      degree_level_code: link.degree_level_code ?? existing.degree_level_code,
      subject_area_code: link.subject_area_code ?? existing.subject_area_code,
    });
  } else {
    // ── Insert new course ──
    const courseInsert: Record<string, unknown> = {
      job_id: jobId,
      name: course.name,
      short_name: course.short_name ?? null,
      degree_level: link.degree_level,
      degree_level_code: link.degree_level_code,
      course_category: normaliseCourseCategory(course.course_category),
      subject_area: course.subject_area ?? null,
      subject_area_code: link.subject_area_code,
      duration_weeks: resolveDurationWeeks(course),
      study_mode: course.study_mode ?? null,
      description: course.description ?? null,
      awarding_institution: course.awarding_institution ?? null,
      source_url: course.source_url ?? null,
      // The public course search joins on upper(countries.iso2) = upper(country_code), so an
      // unresolvable country stays null rather than storing text that can never match.
      country_code: course.country_code ?? null,
      verification_status: "unverified",
    };
    if (course.career_paths?.length) courseInsert.career_paths = course.career_paths;

    const [courseRow] = await masterKnex(`${S}.extraction_courses`).insert(courseInsert).returning("id");
    courseId = courseRow.id;
    logLookupLink(jobId, courseId, course, link);
  }

  // ── Fees + assignments ──
  if (course.fees?.length) {
    for (const fee of course.fees) {
      const feeId = await upsertFee(jobId, {
        name: fee.name ?? null,
        description: fee.description ?? null,
        student_type: fee.student_type ?? "both",
        period_type: fee.period_type ?? "Per Year",
        currency: fee.currency ?? null,
        total_amount: coerceMoney(fee.total_amount),
      });
      await masterKnex(`${S}.extraction_course_fee_assignments`)
        .insert({ job_id: jobId, course_id: courseId, course_fee_id: feeId })
        .onConflict(["course_id", "course_fee_id"]).ignore();
    }
  }

  // ── Intakes + assignments ──
  if (course.intakes?.length) {
    for (const intake of course.intakes) {
      const [intakeRow] = await masterKnex(`${S}.extraction_intakes`)
        .insert({
          job_id: jobId,
          course_id: courseId,
          intake_name: intake.intake_name ?? null,
          start_date: coerceDate(intake.start_date),
          end_date: coerceDate(intake.end_date),
          intake_month: coerceMonth(intake.intake_month),
          intake_year: coerceInt(intake.intake_year),
          admission_deadline: coerceDate(intake.admission_deadline),
        })
        .returning("id");
      await masterKnex(`${S}.extraction_course_intake_assignments`)
        .insert({ job_id: jobId, course_id: courseId, intake_id: intakeRow.id })
        .onConflict(["course_id", "intake_id"]).ignore();
    }
  }

  // ── Study options + assignments ──
  if (course.study_options?.length) {
    for (const opt of course.study_options) {
      const [optRow] = await masterKnex(`${S}.extraction_study_options`)
        .insert({
          job_id: jobId,
          name: opt.name ?? null,
          study_mode: opt.study_mode ?? "on_campus",
          study_load: opt.study_load ?? "full_time",
          duration_value: coerceInt(opt.duration_value),
          duration_unit: opt.duration_unit ?? "months",
        })
        .returning("id");
      await masterKnex(`${S}.extraction_course_study_option_assignments`)
        .insert({ job_id: jobId, course_id: courseId, study_option_id: optRow.id })
        .onConflict(["course_id", "study_option_id"]).ignore();
    }
  }

  // ── Eligibility requirements + assignments ──
  if (course.eligibility?.length) {
    for (const elig of course.eligibility) {
      let scoreType = normaliseScoreType(elig.score_type);
      let scoreValue = coerceMoney(elig.min_score);
      if (!scoreType && scoreValue == null && !elig.min_score_percent) {
        const derived = deriveScoreFromDescription(elig.description);
        if (derived) { scoreType = derived.score_type; scoreValue = derived.value; }
      }
      const isPercentage = scoreType === "percentage";

      const [eligRow] = await masterKnex(`${S}.extraction_eligibility_requirements`)
        .insert({
          job_id: jobId,
          name: elig.name ?? null,
          applicable_to: elig.applicable_to ?? "both",
          description: elig.description ?? null,
          min_score_percent: isPercentage ? scoreValue : coerceInt(elig.min_score_percent),
          min_degree_level: elig.min_degree_level ?? null,
          score_type: scoreType,
          min_score: isPercentage ? null : scoreValue,
        })
        .returning("id");
      await masterKnex(`${S}.extraction_course_eligibility_assignments`)
        .insert({ job_id: jobId, course_id: courseId, eligibility_requirement_id: eligRow.id })
        .onConflict(["course_id", "eligibility_requirement_id"]).ignore();
    }
  }

  // ── English requirements ──
  if (course.english_requirements?.length) {
    for (const eng of course.english_requirements) {
      await masterKnex(`${S}.extraction_english_requirements`).insert({
        job_id: jobId,
        course_id: courseId,
        test_type_name: eng.test_type_name ?? null,
        overall_score: eng.overall_score ?? null,
        listening_score: eng.listening_score ?? null,
        reading_score: eng.reading_score ?? null,
        writing_score: eng.writing_score ?? null,
        speaking_score: eng.speaking_score ?? null,
      });
    }
  }

  // ── Study units + assignments ──
  if (course.study_units?.length) {
    for (const unit of course.study_units) {
      if (!unit.unit_name) continue;
      const unitId = await upsertStudyUnit(jobId, unit);
      await masterKnex(`${S}.extraction_course_study_unit_assignments`)
        .insert({ job_id: jobId, course_id: courseId, study_unit_id: unitId })
        .onConflict(["course_id", "study_unit_id"]).ignore();
    }
  }

  // ── Campus links ──
  if (course.campus_names?.length) {
    for (const campusName of course.campus_names) {
      const campusId = campusIdMap.get(normaliseCampusName(campusName));
      if (campusId) {
        await masterKnex(`${S}.extraction_course_campuses`)
          .insert({ job_id: jobId, course_id: courseId, campus_id: campusId, campus_name: campusName })
          .onConflict().ignore(); // no unique constraint here, but safe
      }
    }
  }

  logger.info("Wrote course", { jobId, courseId, name: course.name });
  return courseId;
}

/**
 * Replace all campuses for a job — delete existing + re-insert.
 * Re-links course-campus junctions by matching normalised campus names.
 * Returns a map of normalised name → new campus ID.
 */
export async function replaceCampuses(
  jobId: string,
  campuses: ExtractedCampus[],
): Promise<Map<string, string>> {
  // Load existing junctions before deleting campuses
  const existingJunctions = await masterKnex(`${S}.extraction_course_campuses`)
    .where({ job_id: jobId })
    .select("course_id", "campus_id", "campus_name");

  // Build old-id → name map from existing campuses
  const oldCampuses = await masterKnex(`${S}.extraction_campuses`).where({ job_id: jobId });
  const oldIdToName = new Map<string, string>();
  for (const c of oldCampuses) {
    oldIdToName.set(c.id, normaliseCampusName(c.name));
  }

  // Delete existing campuses (cascade deletes junctions via DB or we re-create)
  await masterKnex(`${S}.extraction_course_campuses`).where({ job_id: jobId }).delete();
  await masterKnex(`${S}.extraction_campuses`).where({ job_id: jobId }).delete();

  // Insert new campuses, dedup by normalised name
  const idMap = new Map<string, string>();
  for (const campus of campuses) {
    if (!campus.name) continue;
    const norm = normaliseCampusName(campus.name);
    if (idMap.has(norm)) continue;
    const [row] = await masterKnex(`${S}.extraction_campuses`)
      .insert({ job_id: jobId, ...campus })
      .returning("id");
    idMap.set(norm, row.id);
  }

  // Re-link junctions by matching normalised campus name
  for (const junc of existingJunctions) {
    const oldNorm = junc.campus_name
      ? normaliseCampusName(junc.campus_name)
      : oldIdToName.get(junc.campus_id) ?? "";
    const newCampusId = idMap.get(oldNorm);
    if (newCampusId) {
      await masterKnex(`${S}.extraction_course_campuses`)
        .insert({
          job_id: jobId,
          course_id: junc.course_id,
          campus_id: newCampusId,
          campus_name: junc.campus_name,
        })
        .onConflict().ignore();
    }
  }

  logger.info("Replaced campuses", { jobId, count: idMap.size });
  return idMap;
}

/**
 * Upsert an agent by (job_id, external_id).
 * Returns the agent row ID.
 */
export async function upsertAgent(
  jobId: string,
  agent: Record<string, unknown>,
  externalId: string,
): Promise<string> {
  const existing = await masterKnex(`${S}.extraction_agents`)
    .where({ job_id: jobId, external_id: externalId })
    .first();

  if (existing) {
    // Merge: only overwrite nulls
    const updates: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(agent)) {
      if (key === "job_id" || key === "external_id" || key === "id") continue;
      if (val != null && val !== "" && (existing[key] == null || existing[key] === "")) {
        updates[key] = val;
      }
    }
    if (Object.keys(updates).length > 0) {
      updates.updated_at = masterKnex.fn.now();
      await masterKnex(`${S}.extraction_agents`).where({ id: existing.id }).update(updates);
    }
    return existing.id;
  }

  const [row] = await masterKnex(`${S}.extraction_agents`)
    .insert({ job_id: jobId, external_id: externalId, ...agent })
    .returning("id");
  return row.id;
}

/**
 * Insert agent locations for an agent within a job.
 * Deletes existing locations for the agent first to allow re-runs.
 */
export async function writeAgentLocations(
  agentId: string,
  jobId: string,
  locations: Array<Record<string, unknown>>,
): Promise<void> {
  await masterKnex(`${S}.extraction_agent_locations`)
    .where({ agent_id: agentId, job_id: jobId })
    .delete();

  if (locations.length === 0) return;

  const rows = locations.map((loc) => ({
    agent_id: agentId,
    job_id: jobId,
    ...loc,
  }));
  await masterKnex(`${S}.extraction_agent_locations`).insert(rows);
}

// ── Visa services (source_type: "visa_service") ──

export interface ExtractedVisaService {
  name: string;
  provider_name?: string | null;
  type?: string | null;
  description?: string | null;
  registration_number?: string | null;
  registration_body?: string | null;
  registration_status?: string | null;
  registration_level?: string | null;
  visa_types_handled?: string[] | null;
  services_offered?: string[] | null;
  specializations?: string[] | null;
  fee_amount?: number | null;
  fee_currency?: string | null;
  fee_type?: string | null;
  fee_from?: number | null;
  fee_to?: number | null;
  consultation_fee?: number | null;
  consultation_free?: boolean | null;
  success_rate?: number | null;
  cases_handled?: number | null;
  years_experience?: number | null;
  team_size?: number | null;
  qualified_agents_count?: number | null;
  countries_serviced?: string[] | null;
  nationalities_serviced?: string[] | null;
  languages_spoken?: string[] | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  website?: string | null;
  booking_url?: string | null;
  average_rating?: number | null;
  review_count?: number | null;
  source_url?: string | null;
}

// ponytail: same shape as normaliseCourseName/normaliseUnitName — dedup key for re-runs
// and services mentioned on more than one page of the same site.
export function normaliseVisaServiceName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

// text[] columns — knex/pg serialize a plain JS array correctly on its own.
const VISA_SERVICE_ARRAY_FIELDS: Array<keyof ExtractedVisaService> = [
  "visa_types_handled", "specializations",
  "countries_serviced", "nationalities_serviced", "languages_spoken",
];

// services_offered is jsonb, not text[] (see 20260812_004_extraction_visa_services.ts) — a
// plain JS array needs JSON.stringify first, same as writeSiteIntelligence's fee_structure.
// Passing it through the text[] path threw "invalid input syntax for type json".
const VISA_SERVICE_JSON_ARRAY_FIELDS: Array<keyof ExtractedVisaService> = ["services_offered"];

// Plain text/boolean columns — pass through as-is.
const VISA_SERVICE_SCALAR_FIELDS: Array<keyof ExtractedVisaService> = [
  "provider_name", "type", "description", "registration_number", "registration_body",
  "registration_status", "registration_level", "fee_currency", "fee_type", "consultation_free",
  "address", "city", "state", "country", "contact_name", "contact_email", "contact_phone",
  "website", "booking_url",
];

// decimal/integer columns — Gemini routinely writes these as human-formatted strings
// ("97%", "$3,500", "4.8/5 stars", "10 years"), which Postgres rejects outright
// ("invalid input syntax for type numeric"). Every numeric visa-service field gets the
// same defensive coercion, not just the one that happened to be reported — same failure
// mode, same fix, everywhere it can occur. Scoped to visa-service fields only; the
// course pipeline's own coerceInt/coerceDate above are untouched.
const VISA_SERVICE_NUMERIC_FIELDS: Array<keyof ExtractedVisaService> = [
  "fee_amount", "fee_from", "fee_to", "consultation_fee", "success_rate",
  "cases_handled", "years_experience", "team_size", "qualified_agents_count",
  "average_rating", "review_count",
];

function coerceVisaNumber(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return isNaN(v) ? null : v;
  const match = String(v).replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return isNaN(n) ? null : n;
}

/**
 * Write a visa service, deduped by normalised name within the job — mirrors writeCourse's
 * dedup-and-merge (fills nulls on the existing row, never overwrites a value already found).
 * No child/junction tables: extraction_visa_services is flat, one row per distinct service.
 */
export async function writeVisaService(jobId: string, service: ExtractedVisaService): Promise<string> {
  const normName = normaliseVisaServiceName(service.name);
  // Both sides normalise the same way — see the course and study-unit dedups above.
  const existing = await masterKnex(`${S}.extraction_visa_services`)
    .where({ job_id: jobId })
    .whereRaw("regexp_replace(lower(trim(name)), '\\s+', ' ', 'g') = ?", [normName])
    .first();

  if (existing) {
    const updates: Record<string, unknown> = {};
    for (const field of VISA_SERVICE_SCALAR_FIELDS) {
      const newVal = service[field];
      if (newVal != null && newVal !== "" && (existing[field] == null || existing[field] === "")) {
        updates[field] = newVal;
      }
    }
    for (const field of VISA_SERVICE_NUMERIC_FIELDS) {
      const newVal = coerceVisaNumber(service[field]);
      if (newVal != null && existing[field] == null) {
        updates[field] = newVal;
      }
    }
    for (const field of VISA_SERVICE_ARRAY_FIELDS) {
      const newVal = service[field] as string[] | undefined;
      if (newVal?.length && (!existing[field] || existing[field].length === 0)) {
        updates[field] = newVal;
      }
    }
    for (const field of VISA_SERVICE_JSON_ARRAY_FIELDS) {
      const newVal = service[field] as string[] | undefined;
      if (newVal?.length && (!existing[field] || existing[field].length === 0)) {
        updates[field] = JSON.stringify(newVal);
      }
    }
    if (Object.keys(updates).length > 0) {
      updates.updated_at = masterKnex.fn.now();
      await masterKnex(`${S}.extraction_visa_services`).where({ id: existing.id }).update(updates);
      logger.info("Merged duplicate visa service", { jobId, id: existing.id, name: service.name });
    }
    return existing.id;
  }

  const insert: Record<string, unknown> = {
    job_id: jobId,
    name: service.name,
    status: "pending",
  };
  for (const field of VISA_SERVICE_SCALAR_FIELDS) {
    const val = service[field];
    if (val != null && val !== "") insert[field] = val;
  }
  for (const field of VISA_SERVICE_NUMERIC_FIELDS) {
    const val = coerceVisaNumber(service[field]);
    if (val != null) insert[field] = val;
  }
  for (const field of VISA_SERVICE_ARRAY_FIELDS) {
    const val = service[field] as string[] | undefined;
    if (val?.length) insert[field] = val;
  }
  for (const field of VISA_SERVICE_JSON_ARRAY_FIELDS) {
    const val = service[field] as string[] | undefined;
    if (val?.length) insert[field] = JSON.stringify(val);
  }
  if (service.source_url) insert.source_url = service.source_url;

  const [row] = await masterKnex(`${S}.extraction_visa_services`).insert(insert).returning("id");
  logger.info("Wrote visa service", { jobId, id: row.id, name: service.name });
  return row.id;
}

/**
 * Overwrite a specific, already-known visa service row with fresh extraction results —
 * for the admin-triggered "re-extract this one" action, not the automatic per-page pipeline.
 * Unlike writeVisaService's merge branch (fills nulls only, for incidental multi-page
 * aggregation), this overwrites unconditionally: a deliberate manual re-run should trust the
 * new extraction, matching handleCourseDataStep's per-course re-extraction semantics.
 */
export async function updateVisaServiceById(id: string, service: Partial<ExtractedVisaService>): Promise<void> {
  const updates: Record<string, unknown> = {};
  if (service.name) updates.name = service.name;
  for (const field of VISA_SERVICE_SCALAR_FIELDS) {
    const val = service[field];
    if (val != null && val !== "") updates[field] = val;
  }
  for (const field of VISA_SERVICE_NUMERIC_FIELDS) {
    const val = coerceVisaNumber(service[field]);
    if (val != null) updates[field] = val;
  }
  for (const field of VISA_SERVICE_ARRAY_FIELDS) {
    const val = service[field] as string[] | undefined;
    if (val?.length) updates[field] = val;
  }
  for (const field of VISA_SERVICE_JSON_ARRAY_FIELDS) {
    const val = service[field] as string[] | undefined;
    if (val?.length) updates[field] = JSON.stringify(val);
  }
  if (Object.keys(updates).length === 0) return;
  updates.updated_at = masterKnex.fn.now();
  await masterKnex(`${S}.extraction_visa_services`).where({ id }).update(updates);
  logger.info("Re-extracted visa service", { id, name: service.name });
}

/**
 * Insert a queue item, or return null when the row shouldn't be queued:
 * - a row for this (job_id, url) already exists — the DB unique constraint is the real
 *   dedupe (check-then-insert races between concurrent producers, e.g. overlapping
 *   re-runs). The producer that won the insert already dispatched (or will dispatch) it.
 * - the job is at its page_cap — every queued page costs a scrape + a Gemini extraction,
 *   so the cap is the job's spending budget; the admin "Deep scrape" action raises it.
 * On null, the caller must NOT publish.
 * ponytail: the cap check isn't serialized against concurrent inserts — racing workers
 * can overshoot by a few rows, fine for a billing guardrail.
 */
export async function insertQueueItem(jobId: string, url: string): Promise<string | null> {
  const { rows } = await masterKnex.raw(
    `INSERT INTO ${S}.extraction_queue (job_id, url, status)
     SELECT :jobId, :url, 'pending'
     WHERE (SELECT count(*) FROM ${S}.extraction_queue WHERE job_id = :jobId)
         < (SELECT page_cap FROM ${S}.extraction_jobs WHERE id = :jobId)
     ON CONFLICT (job_id, url) DO NOTHING
     RETURNING id`,
    { jobId, url },
  );
  return rows[0]?.id ?? null;
}

/**
 * True once a job's queue has reached its page cap. Callers whose discovery work is
 * expensive per iteration (a scrape + a Gemini call per listing page) should check this
 * and stop early — insertQueueItem already refuses at the cap, but by then the listing
 * page that found those URLs has been paid for.
 */
export async function atPageCap(jobId: string): Promise<boolean> {
  const { rows } = await masterKnex.raw(
    `SELECT (SELECT count(*) FROM ${S}.extraction_queue WHERE job_id = :jobId) >= page_cap AS capped
     FROM ${S}.extraction_jobs WHERE id = :jobId`,
    { jobId },
  );
  return rows[0]?.capped ?? true;
}

/** Write a job event to the timeline */
export async function writeJobEvent(jobId: string, kind: string, opts?: {
  level?: string;
  phase?: string;
  message?: string;
  data?: Record<string, unknown>;
}) {
  await masterKnex(`${S}.extraction_job_events`).insert({
    job_id: jobId,
    kind,
    level: opts?.level ?? "info",
    phase: opts?.phase ?? null,
    message: opts?.message ?? null,
    data: opts?.data ? JSON.stringify(opts.data) : "{}",
  });
}
