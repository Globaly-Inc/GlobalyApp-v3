// Writes LLM-extracted data to the staging tables with proper relationships.

import type { Knex } from "knex";
import { masterKnex } from "../../../../core/db/master-pool.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { geocodeAddress } from "../../../../shared/google-places/placesService.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";
import { parseInstallments, type Installment } from "./installment-parser.js";
import {
  loadLookupLists, resolveAreaOfStudy, resolveDegreeLevel,
  courseCategoryForLevel, categoryForServiceSlug, shouldDemoteForDuration, type CourseCategory,
} from "./lookup-catalog.js";
import { coercePartialDate, morePrecise, normaliseStored, partialDatesAgree } from "./partial-date.js";
import { parseAddress } from "./address-parser.js";

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
  /** The unit's own synopsis, when the curriculum page carries one. */
  description?: string | null;
  /** "compulsory" | "elective" — from the requirement block the unit was listed under
   * ("Core courses", "Electives", "choose two of"). Anything else normalises to null and the
   * column keeps its default. */
  unit_type?: string | null;
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
  orientation_date?: string | null;
  intake_month?: number | string | null;
  intake_year?: number | string | null;
  admission_deadline?: string | null;
  /** Any OTHER dated milestone the page states — exam date, scholarship deadline, orientation
   *  week. Open-ended by nature, which is why it is one jsonb column and not four more. */
  custom_dates?: Array<{ name?: string | null; date?: string | null }> | null;
}

export interface IntakeCustomDate {
  name: string;
  /** "YYYY-MM-DD" or "YYYY-MM" — the precision the page stated, never widened. */
  date: string;
}

/**
 * custom_dates as the column stores them.
 *
 * An entry needs BOTH halves to mean anything: a date with no name is a number on a page nobody
 * can act on, and a name with no date is a label. Either alone is dropped rather than stored —
 * same call as normaliseAcademicTests dropping a nameless test.
 *
 * Deduped on the name, keeping the more precise date, because a calendar page routinely repeats a
 * milestone in a table and again in prose.
 */
export function normaliseCustomDates(v: unknown): IntakeCustomDate[] {
  let arr: unknown = v;
  if (typeof v === "string") {
    try { arr = JSON.parse(v); } catch { return []; }
  }
  if (!Array.isArray(arr)) return [];
  const out: IntakeCustomDate[] = [];
  for (const raw of arr) {
    const entry = raw as { name?: unknown; date?: unknown } | null;
    const name = String(entry?.name ?? "").trim();
    const date = coercePartialDate(entry?.date);
    if (!name || !date) continue;
    const key = name.toLowerCase();

    // Same name, dates that AGREE: one milestone stated at two precisions ("2026-11" on a listing
    // page, "2026-11-15" on the detail page). Keep the sharper — that is enrichment.
    const twin = out.find((e) => e.name.toLowerCase() === key && partialDatesAgree(e.date, date));
    if (twin) {
      twin.date = morePrecise(twin.date, date)!;
      continue;
    }

    // Same name, dates that genuinely CONTRADICT ("2026-11" vs "2026-12"): both are kept. This
    // used to key on the name alone and pick between them by string length, so one stated deadline
    // was silently dropped — and because the intake row is SHARED, the survivor became the only
    // deadline every linked course showed. Choosing between two dates an institution published is
    // guessing, and a guessed deadline is one a student can miss; two visible rows are honest and
    // an admin can delete the wrong one. Same principle as eligibilityRowsAgree forking a row on
    // contradiction rather than merging, and as the intake's own dates never being averaged.
    out.push({ name, date });
  }
  return out;
}

// ponytail: LLM sometimes returns "September" instead of 9
const MONTH_NAMES: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

export function coerceMonth(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return v >= 1 && v <= 12 ? v : null;
  const s = String(v).trim().toLowerCase();
  const n = Number(s);
  if (!isNaN(n) && n >= 1 && n <= 12) return n;
  return MONTH_NAMES[s] ?? null;
}

export function coerceInt(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return isNaN(n) ? null : Math.floor(n);
}

/**
 * intake_month / intake_year from the intake's own name or start date.
 *
 * These two columns are the only ones any intake feature reads — the year filter, the "next
 * intake" badge, the year facet and institution search all key off them, so an intake row
 * carrying just a name ("Semester 1 2027") is invisible to every one of them. The prompt lists
 * both as bare nulls and the LLM routinely leaves them that way, so derive them here instead:
 * deterministic, free, and — unlike a prompt fix — it backfills the rows already stored, which
 * matters because the pipeline keeps no scraped markdown to re-extract from.
 *
 * Only fills what is missing; an explicit LLM or admin value always wins.
 */
export function deriveIntakeMonthYear(
  name: unknown,
  startDate: string | null,
  month: number | null,
  year: number | null,
): { intake_month: number | null; intake_year: number | null } {
  let m = month;
  let y = year;

  if ((m == null || y == null) && typeof name === "string") {
    if (m == null) {
      // Word-boundaried so a short form can't match inside a long one ("sep" vs "September"),
      // and full names come first because MONTH_NAMES lists them first.
      // ponytail: "may" can still fire on prose ("may be deferred"). Intake names are short
      // labels, not sentences, so this hasn't been worth guarding — revisit if a real page bites.
      for (const [word, num] of Object.entries(MONTH_NAMES)) {
        if (new RegExp(`\\b${word}\\b`, "i").test(name)) { m = num; break; }
      }
    }
    // 4-digit year, 19xx-20xx only — "Semester 1 2027" must yield 2027, not 1.
    if (y == null) {
      const match = name.match(/\b(19|20)\d{2}\b/);
      if (match) y = Number(match[0]);
    }
  }

  if ((m == null || y == null) && startDate) {
    // The day is OPTIONAL. start_date is a partial date now (see lib/partial-date.ts), so a page
    // publishing "February 2026" stores "2026-02" — and requiring `-DD` here left intake_month
    // null for it, which is the one column the year filter, the year facet and the "next intake"
    // badge all read. Month precision is exactly enough to fill them.
    const iso = startDate.match(/^(\d{4})-(\d{2})/);
    if (iso) {
      y ??= Number(iso[1]);
      m ??= Number(iso[2]);
    }
  }

  return { intake_month: m != null && m >= 1 && m <= 12 ? m : null, intake_year: y };
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

/**
 * Contexts where a number is a cohort statistic, not an entry requirement.
 *
 * This guard exists because the percentage pattern below matched "95th percentile" in
 * "Average quantitative GMAT scores are 49.5 (95th percentile)." and stored 95 as a minimum
 * grade — a requirement the institution never stated, shown on the public course page as
 * "Minimum score: 95%" and failed against real students' GPAs. A percentile, a cohort average
 * and an acceptance rate are all percentage-shaped and none of them is a floor.
 *
 * Blocklist rather than an allowlist of "minimum"/"at least": most pages state a real threshold
 * with no such keyword ("requires 65% in a bachelor degree"), and an allowlist would drop them.
 */
const NOT_A_MINIMUM = /percentile|\d+\s*(?:st|nd|rd|th)\b|average|\bmean\b|median|typical|top\s*\d|of\s+(?:applicants|admitted|graduates|students)|acceptance\s+rate|employment\s+rate|success\s+rate/i;

// ponytail: same LLM-drift guard as coerceMoney — a score stated plainly in the
// description ("GPA of 3.0") but missing from score_type/min_score. Bare "GPA of X"
// defaults to a 4.0 scale (the common convention) unless the text names a different one.
export function deriveScoreFromDescription(description: string | null | undefined): { score_type: ScoreType; value: number } | null {
  if (!description) return null;
  // Derivation is a guess to begin with; a description carrying statistical language is not a
  // safe place to guess from at all, so bail rather than pick a different number out of it.
  if (NOT_A_MINIMUM.test(description)) return null;
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

export interface ExtractedAcademicTest {
  test_name?: string | null;
  /** A stated minimum the applicant must clear. Gates the eligibility verdict. */
  score?: number | string | null;
  /**
   * What admitted students actually scored — an average, median or percentile the page reports.
   *
   * Separate from `score` because it is not a bar and must never be treated as one: a real page
   * read "Average quantitative GMAT scores are 49.5 (95th percentile)" while also saying the test
   * was not required, and storing 49.5 as a minimum would invent a requirement (and 95 as a
   * percentage grade, which is what it originally did). Displayed as context, never compared.
   */
  typical_score?: number | string | null;
  is_optional?: boolean | null;
}

/**
 * The rows of an eligibility requirement's `academic_tests` jsonb.
 *
 * No resolution against `public.tests` here: both the public card's logo lookup (`testImage`) and
 * the eligibility engine's `sameTest` already match a scraped name against the catalogue by
 * substring, so "GRE General Test" finds GRE without being rewritten. Dropping nameless entries
 * is the only thing that has to happen, since the card and the engine both key off the name.
 */
export function normaliseAcademicTests(v: unknown): ExtractedAcademicTest[] {
  if (!Array.isArray(v)) return [];
  const out: ExtractedAcademicTest[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object") continue;
    const t = raw as ExtractedAcademicTest;
    const name = typeof t.test_name === "string" ? t.test_name.trim() : "";
    if (!name) continue;
    const score = t.score == null || t.score === "" ? null : String(t.score).trim();
    const typical = t.typical_score == null || t.typical_score === "" ? null : String(t.typical_score).trim();
    out.push({
      test_name: name,
      score,
      // A real minimum makes the cohort statistic redundant; never store both.
      typical_score: score ? null : typical,
      is_optional: t.is_optional === true,
    });
  }
  return out;
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
  academic_tests?: ExtractedAcademicTest[] | null;
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
  postcode?: string | null;
  map_link?: string | null;
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
  /** "public" | "private" — ownership, not the educational category (that's
   * extraction_site_intelligence.institution_type: university/college/tafe/...). */
  ownership_type?: string | null;
  description?: string | null;
  logo_url?: string | null;
  source_url?: string | null;
  zip_code?: string | null;
  facebook_url?: string | null;
  instagram_url?: string | null;
  twitter_url?: string | null;
  linkedin_url?: string | null;
  youtube_url?: string | null;
  /** Social/profile links that don't match a known platform column (TikTok, Threads, WhatsApp
   * Business, etc), each with an admin/LLM-supplied label. Not part of OVERVIEW_MERGE_COLUMNS
   * since it's unioned, not overwritten; callers merge it themselves and pass the final array in. */
  other_social_links?: { label: string; url: string }[] | null;
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
  "description", "logo_url", "source_url", "zip_code", "ownership_type",
  "facebook_url", "instagram_url", "twitter_url", "linkedin_url", "youtube_url",
] as const;

export async function writeInstitutionOverview(jobId: string, data: InstitutionOverview) {
  const mergeSet: Record<string, unknown> = { updated_at: masterKnex.fn.now() };
  for (const col of OVERVIEW_MERGE_COLUMNS) {
    mergeSet[col] = masterKnex.raw(
      `COALESCE(NULLIF(EXCLUDED.${col}, ''), ${S}.extraction_institution_overview.${col})`,
    );
  }
  const insertData: Record<string, unknown> = { job_id: jobId, ...data };
  if (data.other_social_links) insertData.other_social_links = JSON.stringify(data.other_social_links);

  const [row] = await masterKnex(`${S}.extraction_institution_overview`)
    .insert(insertData)
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

// Generic labels that, for the common case of a single-primary-site institution, refer to the
// institution's own address even though the name itself doesn't match — "Main Campus" doesn't
// literally say "Ball State University", but it IS Ball State's own address for most schools.
const GENERIC_MAIN_CAMPUS_LABELS = new Set(["main", "central", "home", "primary", "head office", "headquarters"]);

/** Is this campus name either literally the institution's own name, or a generic label
 * ("Main Campus", "Central Campus", ...) that conventionally means the same place? */
export function isMainCampusLabel(campusName: string, institutionName: string): boolean {
  const norm = normaliseCampusName(campusName);
  if (norm === normaliseCampusName(institutionName)) return true;
  return GENERIC_MAIN_CAMPUS_LABELS.has(norm);
}

/**
 * Upsert a campus for a job — deduplicates by normalised name within the same job.
 */
/**
 * Split a raw "street, city, state postcode" address into its parts, filling only what the
 * caller didn't already supply, and trims `address` down to just the street line — matching
 * what the branches step's 3-phase discovery has always done for its own campuses. Without
 * this, a campus found via a course page's `campuses_found` (upserted below with no parsing at
 * all) kept the full address string with no postcode and never geocoded, since geocoding also
 * happens only here.
 */
function parseCampusAddress(campus: ExtractedCampus): ExtractedCampus {
  if (!campus.address) return campus;
  const parsed = parseAddress(campus.address, campus.country);
  const streetLine = [parsed.street1, parsed.street2].filter(Boolean).join(", ");
  return {
    ...campus,
    city: campus.city || parsed.city,
    state: campus.state || parsed.state,
    country: campus.country || parsed.country,
    postcode: campus.postcode || parsed.postcode,
    // Only trim `address` down to the parsed street line when the caller actually relied on
    // parsing to supply the city — if city was already given separately, the address string is
    // structured on its own terms (e.g. "Building 7, 123 Main St") and parseAddress reading its
    // last comma-segment as a trailing locality would silently drop real street content.
    address: (!campus.city && streetLine) ? streetLine : campus.address,
  };
}

/** Geocodes a campus's address, best-effort. Only call this once it's known to be needed —
 * geocoding is a billed external call. */
async function geocodeCampus(campus: ExtractedCampus): Promise<{ map_link?: string; postcode?: string | null }> {
  if (!campus.address) return {};
  try {
    const addressLine = [campus.address, campus.city, campus.state, campus.country].filter(Boolean).join(", ");
    const geocoded = await geocodeAddress(addressLine);
    if (!geocoded) return {};
    return { map_link: geocoded.mapLink, ...(campus.postcode ? {} : { postcode: geocoded.postcode }) };
  } catch (e) {
    logger.warn("Campus geocoding failed", { name: campus.name, error: e instanceof Error ? e.message : String(e) });
    return {};
  }
}

/** Null on either side is unknown, not a contradiction — same rule partialDatesAgree uses for
 * intake dates. Guards against geocoding a NEW occurrence's address onto an EXISTING campus row
 * that names a genuinely different place under the same normalised name. */
function campusLocationsAgree(a: { city?: string | null; state?: string | null; country?: string | null }, b: typeof a): boolean {
  for (const key of ["city", "state", "country"] as const) {
    const av = a[key]?.trim().toLowerCase();
    const bv = b[key]?.trim().toLowerCase();
    if (av && bv && av !== bv) return false;
  }
  return true;
}

export async function upsertCampus(jobId: string, rawCampus: ExtractedCampus): Promise<string> {
  if (!rawCampus.name) return "";
  const campus = parseCampusAddress(rawCampus);

  const allCampuses = await masterKnex(`${S}.extraction_campuses`)
    .where({ job_id: jobId });

  const norm = normaliseCampusName(campus.name!);
  const existing = allCampuses.find(c => normaliseCampusName(c.name) === norm);

  // A course page frequently names a campus (its own institution, "Main Campus", or any other
  // generic label) when no more specific location is stated (course.campus_names in
  // extraction-page.worker.ts) — that call only ever supplies a bare `{ name }`, with none of
  // the enrichment (address parsing, geocoding, phone/email fallback) handleBranchesStep's
  // real 3-phase discovery gets. Left as-is, this stub is indistinguishable in the UI from a
  // genuine, fully-blank branch.
  const isBare = (c: { city?: unknown; state?: unknown; country?: unknown; address?: unknown; phone?: unknown; email?: unknown }) =>
    !c.city && !c.state && !c.country && !c.address && !c.phone && !c.email;

  const overviewFor = (() => {
    let cached: Promise<Record<string, unknown> | undefined> | null = null;
    return () => (cached ??= masterKnex(`${S}.extraction_institution_overview`).where({ job_id: jobId }).first());
  })();

  // The institution overview has no map_link column of its own — geocode whatever address is
  // being copied in, same as the "Find Missing Details" button does per-campus. Best-effort:
  // the caller still gets everything else even if this fails.
  const geocodeOverview = async (overview: Record<string, unknown>): Promise<Record<string, unknown>> => {
    if (!overview.address) return {};
    const addressLine = [overview.address, overview.city, overview.state, overview.country].filter(Boolean).join(", ");
    try {
      const geocoded = await geocodeAddress(addressLine);
      if (!geocoded) return {};
      return { map_link: geocoded.mapLink, ...(overview.zip_code ? {} : { postcode: geocoded.postcode }) };
    } catch (e) {
      logger.warn("Campus geocoding failed during stub enrichment", { error: e instanceof Error ? e.message : String(e) });
      return {};
    }
  };

  if (existing) {
    if (isBare(existing)) {
      const overview = await overviewFor();
      if (overview?.name && isMainCampusLabel(campus.name!, overview.name as string)) {
        // Same entity as the institution itself — safe to copy its full location too.
        await masterKnex(`${S}.extraction_campuses`).where({ id: existing.id }).update({
          city: overview.city, state: overview.state, country: overview.country,
          address: overview.address, postcode: overview.zip_code,
          phone: overview.phone, email: overview.email,
          ...(await geocodeOverview(overview)),
        });
      } else if (overview && (overview.phone || overview.email) && !existing.phone && !existing.email) {
        // A differently-named branch ("Main Campus", "City Campus", ...) isn't necessarily at
        // the institution's own address, so its location stays unset — but a branch office
        // reasonably shares the institution's phone/email until it has its own on file.
        await masterKnex(`${S}.extraction_campuses`).where({ id: existing.id }).update({
          phone: existing.phone ?? overview.phone, email: existing.email ?? overview.email,
        });
      }
    } else if (!existing.map_link && campus.address && campusLocationsAgree(campus, existing)) {
      // This occurrence supplies an address the existing campus row doesn't have a map link
      // for yet — geocode and persist it instead of running (and discarding) the same lookup
      // on every rerun/duplicate page that names this campus. Guarded by campusLocationsAgree so
      // a differently-located same-named campus (a data error, or two genuinely different sites
      // sharing a generic label) doesn't get a map_link stamped from an address that contradicts
      // its own stored city/state/country.
      const geocoded = await geocodeCampus(campus);
      if (geocoded.map_link) {
        await masterKnex(`${S}.extraction_campuses`).where({ id: existing.id }).update({
          map_link: geocoded.map_link,
          ...(!existing.postcode && geocoded.postcode ? { postcode: geocoded.postcode } : {}),
        });
      }
    }
    return existing.id;
  }

  let enriched = campus;
  if (!enriched.map_link) {
    enriched = { ...enriched, ...(await geocodeCampus(enriched)) };
  }
  if (isBare(campus)) {
    const overview = await overviewFor();
    if (overview?.name && isMainCampusLabel(campus.name!, overview.name as string)) {
      enriched = {
        ...enriched,
        city: overview.city, state: overview.state, country: overview.country,
        address: overview.address, postcode: overview.zip_code,
        phone: overview.phone, email: overview.email,
        ...(await geocodeOverview(overview)),
      } as ExtractedCampus;
    } else if (overview && (overview.phone || overview.email)) {
      enriched = { ...enriched, phone: overview.phone as string | null, email: overview.email as string | null };
    }
  } else if (!campus.phone || !campus.email) {
    // Not bare — it has an address of its own — but the page rarely repeats the institution's
    // phone/email on a branch's own page, so fall back to the institution's until the branch
    // has its own on file (same reasoning as the bare-stub branch above).
    const overview = await overviewFor();
    if (overview && (overview.phone || overview.email)) {
      enriched = {
        ...enriched,
        phone: campus.phone || (overview.phone as string | null),
        email: campus.email || (overview.email as string | null),
      };
    }
  }

  const [row] = await masterKnex(`${S}.extraction_campuses`)
    .insert({ job_id: jobId, ...enriched })
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
  // `_` too: the prompt asks the extractor for exactly `full_time`/`part_time`, and \b treats
  // that as one word — so the canonical values were the two this failed to recognise.
  if (/\b(part[-_ ]?time|pt)\b/.test(s)) return "part_time";
  if (/\b(full[-_ ]?time|ft)\b/.test(s)) return "full_time";
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
 * Canonical `unit_type` — the platform's enum is compulsory | elective. Sources say it in the
 * requirement block's heading rather than in a field ("Core courses", "Required Coursework",
 * "Electives", "Choose two of the following"), so both wordings are matched.
 *
 * Returns null when the source says nothing, so the caller can leave the column alone: it is
 * NOT NULL DEFAULT 'compulsory', and writing a guess would assert a requirement the page never
 * made.
 */
export function normaliseUnitType(v: unknown): "compulsory" | "elective" | null {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return null;
  if (/elective|option|optional|choose|select|specialis|specializ/.test(s)) return "elective";
  if (/compulsory|core|required|mandatory|prescribed/.test(s)) return "compulsory";
  return null;
}

/**
 * A study unit is a COURSE the student sits inside a qualification. The model sometimes reads a
 * programme INDEX page and hands back the programme list as one course's curriculum — that is
 * how a job ended up with "Business Administration (Evening)" and "Biomedical Informatics" as
 * study units. Those rows are worse than a gap: they read as a real curriculum.
 *
 * Two tests, because the single-row one alone is too weak. Per unit: reject a name that is the
 * course's own name, that carries a degree word, or that is another course of the same job.
 * Per batch: when most of a batch collides with the job's own course names, the model was
 * reading an index page, so the WHOLE batch goes — the few names that happen not to collide are
 * no more trustworthy than the ones that do.
 *
 * `isProgrammeName` is injected (writeCourse resolves it against the job's courses in one
 * query) so this stays pure and testable.
 */
const UNIT_DEGREE_TOKEN_RE = /\b(bachelors?|masters?|doctor(?:al|ate)?|ph\.?d|d\.?phil|mba|mphil|m\.?sc|b\.?sc|b\.?eng|m\.?eng|b\.?a|m\.?a|ll\.?b|ll\.?m|b\.?ed|m\.?ed|associate degree|foundation degree|(?:under)?graduate (?:certificate|diploma)|postgraduate (?:certificate|diploma)|minor in|major in|honours degree|\(hons\))\b/i;

/** Above this share of a batch colliding with the job's course names, the batch is an index
 * page rather than a curriculum. Judged only from 3 units up — a 1-2 unit batch has no shape. */
const UNIT_BATCH_COLLISION_LIMIT = 0.6;
const UNIT_BATCH_MIN = 3;

export function filterStudyUnits(
  units: ExtractedStudyUnit[],
  courseName: string,
  isProgrammeName: (normalisedName: string) => boolean,
): { kept: ExtractedStudyUnit[]; dropped: Array<{ name: string; reason: string }>; batchRejected: boolean } {
  const ownName = normaliseCourseName(courseName);
  const dropped: Array<{ name: string; reason: string }> = [];
  const kept: ExtractedStudyUnit[] = [];
  let collisions = 0;

  for (const unit of units) {
    const name = unit.unit_name?.trim();
    if (!name || name.length < 3) {
      dropped.push({ name: String(unit.unit_name ?? ""), reason: "empty or too short" });
      continue;
    }
    const key = normaliseCourseName(name);
    if (key === ownName) {
      dropped.push({ name, reason: "is the course's own name" });
      continue;
    }
    if (UNIT_DEGREE_TOKEN_RE.test(name)) {
      dropped.push({ name, reason: "carries a degree word — it is a qualification, not a unit" });
      continue;
    }
    if (isProgrammeName(key)) {
      collisions++;
      dropped.push({ name, reason: "is another course of this job" });
      continue;
    }
    kept.push(unit);
  }

  const batchRejected =
    units.length >= UNIT_BATCH_MIN && collisions / units.length > UNIT_BATCH_COLLISION_LIMIT;
  if (batchRejected) {
    for (const unit of kept) {
      dropped.push({ name: unit.unit_name, reason: "batch rejected — the page was a programme index" });
    }
    return { kept: [], dropped, batchRejected };
  }
  return { kept, dropped, batchRejected };
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
  const unitType = normaliseUnitType(unit.unit_type);
  const description = unit.description?.trim() || null;
  if (existing) {
    // The same unit is listed on several pages of a catalogue, and a later one is often the
    // richer: the programme page gives a bare title, the course catalogue adds the code, the
    // credits and the synopsis. Fill what the stored row is missing; never overwrite.
    const fill: Record<string, unknown> = {};
    if (existing.unit_code == null && unit.unit_code) fill.unit_code = unit.unit_code;
    if (existing.credit_points == null && coerceInt(unit.credit_points) != null) {
      fill.credit_points = coerceInt(unit.credit_points);
    }
    if (existing.description == null && description) fill.description = description;
    if (Object.keys(fill).length) {
      await masterKnex(`${S}.extraction_study_units`)
        .where({ id: existing.id })
        .update({ ...fill, updated_at: masterKnex.fn.now() });
    }
    return existing.id;
  }

  const [row] = await masterKnex(`${S}.extraction_study_units`)
    .insert({
      job_id: jobId,
      unit_code: unit.unit_code ?? null,
      unit_name: unit.unit_name,
      credit_points: coerceInt(unit.credit_points),
      description,
      // Omitted when the source said nothing, so the column's own default stands rather than
      // this write asserting "compulsory" for an elective.
      ...(unitType ? { unit_type: unitType } : {}),
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

/** Empty = the job wants every level. */
const jobLevelsCache = new Map<string, Set<string>>();

async function jobDegreeLevels(jobId: string): Promise<Set<string>> {
  const cached = jobLevelsCache.get(jobId);
  if (cached) return cached;
  const row = await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).first("degree_level_codes");
  const set = new Set<string>(row?.degree_level_codes ?? []);
  jobLevelsCache.set(jobId, set);
  return set;
}

/** The kind of course the job's service category asks for; null for a job with no category. */
const jobCategoryCache = new Map<string, CourseCategory | null>();

async function jobCourseCategory(jobId: string): Promise<CourseCategory | null> {
  const cached = jobCategoryCache.get(jobId);
  if (cached !== undefined) return cached;
  const row = await masterKnex(`${S}.extraction_jobs as j`)
    .leftJoin("public.service_categories as sc", "sc.id", "j.service_category_id")
    .where("j.id", jobId)
    .first("sc.slug");
  const resolved = categoryForServiceSlug(row?.slug);
  jobCategoryCache.set(jobId, resolved);
  return resolved;
}

/**
 * The level slugs this job would REFUSE, or null when it refuses nothing. Stated as an EXCLUSION
 * because isCourseInScope only ever rejects a level it positively knows about. Listing the allowed
 * ones instead needs a complete universe, and any level missing from it — deactivated after the job
 * was created, or added through the admin catalogue API — silently flips to out-of-scope on the
 * read side while the writer still accepts it.
 *
 * Reads ALL levels, active or not: this module deactivates rather than deletes, and a course staged
 * before a level was retired still carries it.
 */
export async function jobExcludedLevels(jobId: string): Promise<string[] | null> {
  const wantedCategory = await jobCourseCategory(jobId);
  const wantedLevels = await jobDegreeLevels(jobId);
  if (!wantedCategory && wantedLevels.size === 0) return null;

  const rows: Array<{ slug: string }> = await masterKnex("degree_levels").select("slug");
  // (a null degree_level_code is excluded too on a scoped job — see the SQL in courses.repository)
  return rows
    .map((r) => r.slug)
    .filter((slug) => {
      const category = courseCategoryForLevel(slug);
      if (wantedCategory && category && category !== wantedCategory) return true;
      return wantedLevels.size > 0 && !wantedLevels.has(slug);
    });
}

/**
 * Both scopes apply: the stepper's service category (Academic vs Short Courses) and, within it,
 * the degree levels picked. A course with no level is kept — it can't be judged by either.
 */
export async function isCourseInScope(jobId: string, levelCode: string | null): Promise<boolean> {
  const wantedCategory = await jobCourseCategory(jobId);
  const wantedLevels = await jobDegreeLevels(jobId);

  // An unscoped job takes whatever the site publishes.
  if (!wantedCategory && wantedLevels.size === 0) return true;

  // A SCOPED job takes only what it can positively place. A course whose level could not be
  // resolved is not provably academic (or provably short), so it does not belong — this is what
  // keeps department index pages and unlabelled workshops out. Every skip is logged by name, and
  // an unscoped job still stages them for review.
  if (!levelCode) return false;

  const category = courseCategoryForLevel(levelCode);
  if (wantedCategory && category && category !== wantedCategory) return false;

  return wantedLevels.size === 0 || wantedLevels.has(levelCode);
}

// A course with no level is kept — it can't be judged.
async function skipOutOfScope(jobId: string, course: ExtractedCourse, levelCode: string | null) {
  if (await isCourseInScope(jobId, levelCode)) return false;
  const wantedCategory = await jobCourseCategory(jobId);
  const wantedLevels = [...(await jobDegreeLevels(jobId))];
  linkLogger.info("skipped — outside the job's scope", {
    jobId, course: course.name, degree_level_code: levelCode,
    // Which scope refused it: the category, the picked levels, or both.
    refused_by: wantedCategory && courseCategoryForLevel(levelCode) !== wantedCategory
      ? "service category" : "degree levels",
    job_category: wantedCategory, job_levels: wantedLevels,
  });
  return true;
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

/** Dates that, if they disagree, mean two intakes are genuinely different sittings. */
const INTAKE_DATE_FIELDS = ["start_date", "end_date", "orientation_date", "admission_deadline"] as const;

// Comparison and precision live in lib/partial-date.ts, because a stored value is now either a
// full date or a month and "same sitting" has to mean the same across the two: a page stating
// "September 2026" and one stating "21 September 2026" describe one intake, not two.
const datesAgree = partialDatesAgree;

/**
 * Upsert an intake for a JOB and link the course to it — one "Semester 1 2027" row shared by
 * every course that offers it, exactly as eligibility requirements and fees are shared.
 *
 * Identity is name + month + year, with the four dates required merely not to CONTRADICT (a null
 * on either side is unknown, not a difference) — so a page that adds a deadline enriches the
 * shared row instead of forking a near-duplicate, while two genuinely different sittings under
 * the same name stay apart.
 *
 * Sharing is what the schema was always built for: `extraction_course_intake_assignments` has
 * carried `unique(course_id, intake_id)` since 20260805_005, the admin Intakes tab has had a
 * course link/unlink picker throughout, and ai-counsellor already reads through the junction. The
 * blocker was this writer keying on `course_id`, which forced one row per course.
 *
 * `course_id` is deliberately left NULL now. It is the legacy path — every public read has moved
 * to the junction, because a shared intake cannot name a single course in a scalar column, and a
 * column holding "whichever course happened to be written first" is worse than an empty one.
 *
 * ponytail: find-then-write, same as upsertStudyUnit/upsertCampus — a job's pages are consumed by
 * one worker at a time, so the read-then-write gap isn't a real race. Add a unique index if pages
 * are ever fanned out across worker processes.
 */
export async function upsertIntake(
  jobId: string,
  intake: ExtractedIntake,
  sourceUrl: string | null,
): Promise<string> {
  const startDate = coercePartialDate(intake.start_date);
  const derived = deriveIntakeMonthYear(
    intake.intake_name,
    startDate,
    coerceMonth(intake.intake_month),
    coerceInt(intake.intake_year),
  );
  const fields = {
    intake_name: intake.intake_name ?? null,
    start_date: startDate,
    end_date: coercePartialDate(intake.end_date),
    orientation_date: coercePartialDate(intake.orientation_date),
    admission_deadline: coercePartialDate(intake.admission_deadline),
    intake_month: derived.intake_month,
    intake_year: derived.intake_year,
    source_url: sourceUrl,
  };
  // Kept out of `fields` so it never joins the identity/agreement comparison below: two pages can
  // legitimately list different subsets of an intake's milestones, and that is not a reason to
  // fork the row. Merged into the existing row's set instead (see the update branch).
  const customDates = normaliseCustomDates(intake.custom_dates);

  // Job-scoped, no course_id — this is what makes the row shareable.
  const candidates = await masterKnex(`${S}.extraction_intakes`)
    .where({ job_id: jobId })
    .whereRaw("COALESCE(LOWER(TRIM(intake_name)), '') = ?", [(intake.intake_name ?? "").trim().toLowerCase()])
    .whereRaw("COALESCE(intake_month, 0) = ?", [fields.intake_month ?? 0])
    .whereRaw("COALESCE(intake_year, 0) = ?", [fields.intake_year ?? 0]);

  // Best match, not first match. A job can hold several real sittings under one name — job
  // 3e4a6521 has "Fall 2027" with deadlines 2025-11-30, 2025-12-14 and 2026-12-14 — plus rows
  // with no dates at all, which are compatible with every one of them. Taking the first
  // compatible candidate would attach this intake to whichever row happened to be created
  // earliest; ranking by how many dates actually MATCH (rather than merely fail to contradict)
  // puts it with the sitting it shares a deadline with, and leaves the dateless row as the
  // fallback it should be.
  const existing = candidates
    .filter((row: Record<string, unknown>) =>
      INTAKE_DATE_FIELDS.every((f) => datesAgree(row[f], fields[f])),
    )
    .map((row: Record<string, unknown>) => ({
      row,
      matched: INTAKE_DATE_FIELDS.filter((f) => row[f] != null && fields[f] != null).length,
    }))
    .sort((a, b) => b.matched - a.matched)[0]?.row;

  if (existing) {
    // Blanks get filled, and a DATE additionally gets sharpened: a row holding "2026-09" from a
    // page that published only the month is improved by a later page publishing "2026-09-21", and
    // the two agreed to reach here. Without this the first, vaguer page would win permanently —
    // which is the same "thinnest row wins" failure the English requirements had (see CLAUDE.md
    // (i)). Never the other way round: an exact date is never blurred back to its month.
    const updates: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (v == null) continue;
      if ((INTAKE_DATE_FIELDS as readonly string[]).includes(k)) {
        const best = morePrecise(existing[k], v);
        if (best !== normaliseStored(existing[k])) updates[k] = best;
        continue;
      }
      if (existing[k] == null) updates[k] = v;
    }
    // Union by name, this page's precision winning a tie-break only when it is sharper. A page
    // that lists no milestones must not wipe the ones another page found.
    if (customDates.length > 0) {
      const merged = normaliseCustomDates([
        ...normaliseCustomDates(existing.custom_dates),
        ...customDates,
      ]);
      if (JSON.stringify(merged) !== JSON.stringify(normaliseCustomDates(existing.custom_dates))) {
        updates.custom_dates = JSON.stringify(merged);
      }
    }
    if (Object.keys(updates).length > 0) {
      await masterKnex(`${S}.extraction_intakes`)
        .where({ id: existing.id })
        .update({ ...updates, updated_at: masterKnex.fn.now() });
    }
    return existing.id as string;
  }

  const [row] = await masterKnex(`${S}.extraction_intakes`)
    .insert({ job_id: jobId, ...fields, custom_dates: JSON.stringify(customDates) })
    .returning("id");
  return row.id;
}

/** The fields the eligibility verdict engine actually gates a student on. */
const ELIG_GATE_FIELDS = ["min_score", "min_score_percent", "min_degree_level", "score_type"] as const;

/**
 * A stored value against an incoming one, treating null/"" as "unknown" — never a disagreement.
 * Compared numerically when both sides are numbers, because `min_score` and `min_score_percent`
 * are `decimal` columns and pg hands those back as strings ("300.00" must equal 300).
 */
function eligValuesAgree(stored: unknown, incoming: unknown): boolean {
  if (stored == null || stored === "" || incoming == null || incoming === "") return true;
  const a = Number(stored);
  const b = Number(incoming);
  if (!Number.isNaN(a) && !Number.isNaN(b)) return a === b;
  return String(stored).trim().toLowerCase() === String(incoming).trim().toLowerCase();
}

/**
 * The gating shape of a row's academic tests, as a sorted comparable list: which test, the minimum
 * to clear, and whether clearing it is required at all.
 *
 * `typical_score` is deliberately excluded — a cohort average gates nothing, so two rows quoting
 * different averages are still the same requirement, and forking on one would cost sharing for no
 * safety. Everything else is in: a scoreless entry counts (a row that names GRE without a number
 * is a different rule from one that demands 320), and so does `is_optional` (the verdict engine
 * drops a test the student lacks only when the requirement says it is optional).
 */
function testRules(v: unknown): string[] {
  let arr: unknown = v;
  if (typeof v === "string") {
    try { arr = JSON.parse(v); } catch { return []; }
  }
  if (!Array.isArray(arr)) return [];
  const rules: string[] = [];
  for (const t of arr) {
    const test = t as ExtractedAcademicTest | null;
    const name = String(test?.test_name ?? "").trim().toLowerCase();
    if (!name) continue;
    const score = test?.score == null ? "" : String(test.score).trim();
    rules.push(`${name}\u0000${score}\u0000${test?.is_optional ? "opt" : "req"}`);
  }
  return rules.sort();
}

/**
 * Whether a stored row and an incoming requirement can be the SAME shared row.
 *
 * Name + audience is not an identity. Institutions reuse generic labels — "Admission test",
 * "Academic requirement", "English requirement" — across courses that demand different things.
 * Keyed on the name alone, the second course was linked to the first course's row and its own
 * threshold silently dropped (the update below only fills blanks), so the verdict engine judged
 * every later course against the first one's numbers. That is the same class of defect as a
 * fabricated minimum: wrong data gating a real student's eligibility.
 *
 * So a populated value that CONTRADICTS forks a separate row, while a blank on either side stays
 * shareable — the same non-contradiction rule upsertIntake applies to its four dates.
 */
export function eligibilityRowsAgree(
  existing: Record<string, unknown>,
  fields: Record<string, unknown>,
): boolean {
  if (!ELIG_GATE_FIELDS.every((f) => eligValuesAgree(existing[f], fields[f]))) return false;

  // Two rows that BOTH name tests must name the same ones, on the same terms.
  //
  // The update below only writes academic_tests when the stored value is the '[]' default, so
  // there is no such thing as adding a test to a populated row: any difference here means the
  // incoming course's own test rules are silently discarded and it is judged by the stored row's
  // instead — a course wanting GMAT 650 evaluated against GRE 320, an optional test enforced as
  // mandatory, or a real stated minimum replaced by a row that only quotes a cohort average.
  //
  // A row naming NO tests stays compatible with one that does, deliberately. Pages describe the
  // same institution-level requirement at different levels of detail, and the pipeline already
  // reads a requirement as institution-wide (see findRequirementsForCourse, which applies an
  // unassigned requirement to every course lacking its own). Forking on absence would fork nearly
  // every row and defeat the sharing this exists for.
  const incoming = testRules(fields.academic_tests);
  const stored = testRules(existing.academic_tests);
  if (incoming.length > 0 && stored.length > 0 && incoming.join(" | ") !== stored.join(" | ")) {
    return false;
  }
  return true;
}

/**
 * Upsert an eligibility requirement for a job — deduplicates by normalised name + audience, with
 * the gating values required not to contradict (see eligibilityRowsAgree), mirroring upsertIntake
 * above and for the same reason (see its comment).
 *
 * Job-scoped rather than course-scoped because that is how the table is already shared: a
 * requirement row is attached to courses through extraction_course_eligibility_assignments, and
 * one "Bachelor degree or equivalent" row legitimately serves many courses on the same job.
 *
 * A requirement with no name can't be identified, so it is always inserted — dedupe would have to
 * compare free-text descriptions, which is not worth guessing at.
 */
export async function upsertEligibility(
  jobId: string,
  elig: ExtractedEligibility,
  fields: Record<string, unknown>,
): Promise<string> {
  const name = (elig.name ?? "").trim();
  if (name) {
    // Every same-name candidate, oldest first — not .first(). A job can legitimately hold several
    // rows under one generic name, and the right one to join is the one whose stated thresholds
    // this course agrees with, not whichever was scraped earliest.
    const candidates = await masterKnex(`${S}.extraction_eligibility_requirements`)
      .where({ job_id: jobId, applicable_to: elig.applicable_to ?? "both" })
      .whereRaw("LOWER(TRIM(name)) = ?", [name.toLowerCase()])
      .orderBy("created_at", "asc");
    const existing = candidates.find((row: Record<string, unknown>) =>
      eligibilityRowsAgree(row, fields),
    );
    if (existing) {
      // academic_tests is compared unparsed: '[]' is the column default, so "existing is empty"
      // is the one case worth overwriting — an earlier page that found no tests must not keep a
      // later page's findings out.
      const updates = Object.fromEntries(
        Object.entries(fields).filter(([k, v]) => {
          if (v == null) return false;
          if (k === "academic_tests") return v !== "[]" && (existing[k] == null || JSON.stringify(existing[k]) === "[]");
          return existing[k] == null || existing[k] === "";
        }),
      );
      if (Object.keys(updates).length > 0) {
        await masterKnex(`${S}.extraction_eligibility_requirements`)
          .where({ id: existing.id })
          .update({ ...updates, updated_at: masterKnex.fn.now() });
      }
      return existing.id;
    }
  }

  const [row] = await masterKnex(`${S}.extraction_eligibility_requirements`)
    .insert({ job_id: jobId, ...fields })
    .returning("id");
  return row.id;
}

/**
 * The patch an existing English row takes from a newly extracted one: blanks filled, stated values
 * never overwritten.
 *
 * Pure and exported so the merge rule is testable without a database — see
 * tests/eligibility-extraction.ts. It is the only non-obvious part of upsertEnglishRequirement.
 *
 * Never overwriting is the deliberate half. A page saying "IELTS 6.5" with no bands must not keep a
 * later page's band minimums out, but a page saying 7.0 must not silently raise a bar another page
 * already stated for this course either — that is the same defect class as a fabricated minimum,
 * one page's number gating a student against a course that stated a different one.
 *
 * ponytail: on a genuine disagreement the first stated value stands and `source_url` records which
 * page it came from, for the admin to resolve. Fork a second row (as upsertEligibility does for
 * contradicting requirements) only if real sites turn out to state alternative English bars per
 * entry pathway.
 */
export function englishUpdates(
  existing: Record<string, unknown>,
  fields: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).filter(
      ([k, v]) => v != null && v !== "" && (existing[k] == null || existing[k] === ""),
    ),
  );
}

/**
 * Upsert a course's English requirement — deduplicates by (course_id, test name) so one bar stated
 * on a listing page, its detail page and a catalog entry is ONE row.
 *
 * This was the last extracted child entity still written with a bare insert (see CLAUDE.md (c),
 * which gave intakes, requirements and fees their upserts and missed this table). Duplicates here
 * are not merely untidy: the public course card renders one tile per row, and evaluateEligibility's
 * percentage is a share of the criteria it emitted, so three IELTS rows weight English three times
 * in a real student's verdict.
 *
 * Course-scoped, unlike upsertEligibility/upsertIntake — this table has a direct `course_id` and
 * `course_id IS NULL` is what findEnglishRequirementsForCourse reads as institution-wide, so these
 * rows are never shared between courses and there is no junction to key on.
 *
 * An entry naming no test is dropped rather than stored. `sameTest` can match nothing against a
 * null name, so a nameless row can never be compared to a student's tests: it would emit an
 * "English test ≥ 6.5" criterion that is permanently `unknown`, capping the verdict percentage
 * below 100 forever, and render on the public card as a tile labelled "Test". A score with no test
 * to attach it to is not a requirement.
 */
export async function upsertEnglishRequirement(
  jobId: string,
  courseId: string,
  eng: ExtractedEnglishReq,
  sourceUrl: string | null,
  /** Query handle — pass a transaction to make a delete-then-rewrite of a course's rows atomic. */
  db: Knex | Knex.Transaction = masterKnex,
): Promise<string | null> {
  const name = (eng.test_type_name ?? "").trim();
  if (!name) return null;

  const fields = {
    test_type_name: name,
    overall_score: eng.overall_score ?? null,
    listening_score: eng.listening_score ?? null,
    reading_score: eng.reading_score ?? null,
    writing_score: eng.writing_score ?? null,
    speaking_score: eng.speaking_score ?? null,
    source_url: sourceUrl,
  };

  const existing = await db(`${S}.extraction_english_requirements`)
    .where({ job_id: jobId, course_id: courseId })
    .whereRaw("LOWER(TRIM(test_type_name)) = ?", [name.toLowerCase()])
    .orderBy("created_at", "asc")
    .first();
  if (existing) {
    const updates = englishUpdates(existing, fields);
    if (Object.keys(updates).length > 0) {
      await db(`${S}.extraction_english_requirements`)
        .where({ id: existing.id })
        .update({ ...updates, updated_at: masterKnex.fn.now() });
    }
    return existing.id;
  }

  const [row] = await db(`${S}.extraction_english_requirements`)
    .insert({ job_id: jobId, course_id: courseId, ...fields })
    .returning("id");
  return row.id;
}

/**
 * Upsert a fee for a job — deduplicates by (student_type, period_type, currency, total_amount,
 * fee kind) within the same job so a shared rate (e.g. "$325/credit for all programs") creates ONE
 * row linked to multiple courses via extraction_course_fee_assignments, not one identical row per
 * course. The name itself is excluded from the key because LLM wording varies across pages, but the
 * KIND it maps to is not: ancillary fees are small round numbers, so a $100 application fee and a
 * $100 enrolment fee collide on amount alone and one of them silently disappeared.
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
  const kind = feeTypeFor(fee.name);
  const existing = (await q as Array<{ id: string; name: string | null; description: string | null }>)
    .find((r) => feeTypeFor(r.name) === kind);
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
      installments: JSON.stringify(feeBreakdown({ ...fee, period_type: periodType, name, fee_type: kind })),
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
 * Whether an EXTRACTED fee is one of the two kinds the pipeline stages: tuition (under any of the
 * page's own wordings) and the application fee. Everything else — enrolment, material, exam, health
 * cover, student services, late payment — is out of scope per FEE_SCOPE_RULE.
 *
 * The prompts state the rule, and a model that ignores it used to reach the staging tables anyway,
 * because nothing downstream re-checked. feeTypeFor already classifies the label for the fee form,
 * so the check costs one call. Guarded by `npm run test:fee-scope`.
 *
 * Deliberately NOT inside upsertFee: the AgentCIS import writes the institution's own structured
 * fee list, where a material or insurance fee is real data rather than a model overreaching. This
 * guards the LLM paths only — writeCourse and the step worker's fee branch.
 */
/**
 * Excluded charges that have no `fee_types` entry of their own, so feeTypeFor cannot recognise
 * them and its "unrecognised means tuition" default used to wave them through — the worst possible
 * outcome, since a $400 accommodation deposit then reads as the course's headline price. The first
 * five kinds FEE_SCOPE_RULE names (enrolment, material, exam, health cover, student services) are
 * already FEE_TYPE_KEYWORDS entries and need nothing here; these are the rest of that list, plus
 * the ancillary charges a university fee table actually puts next to tuition.
 *
 * "graduation", never "graduat" — a Graduate Tuition Fee is tuition. Deliberately NOT an
 * allow-list: a bare figure with no label at all, or one labelled "Standard Rate 2027", IS the
 * page's headline tuition, and dropping it would lose the number the whole fee tab exists to show.
 */
const OUT_OF_SCOPE_FEE =
  /accommodat|housing|hostel|dormitor|boarding|transport|parking|shuttle|graduation|convocation|deposit|caution money|library|technolog|laborator|\blab fee|activity fee|sport|gym|orientation fee|id card|alumni|administrative fee|admin fee/i;

export function isExtractableFee(name: string | null | undefined): boolean {
  const s = name ?? "";
  // An explicit tuition/application marker wins outright, so a course whose SUBJECT is one of the
  // words below ("Travel & Tourism Tuition Fee", "Transport Engineering Program Fee") is never
  // mistaken for the ancillary charge of the same name.
  if (!/tuition|application/i.test(s) && OUT_OF_SCOPE_FEE.test(s)) return false;
  const kind = feeTypeFor(name);
  return kind === "Tuition Fee" || kind === "Application Fee";
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
  /** Resolved kind from the raw label; falls back to the cleaned name when absent. */
  fee_type?: string | null;
  period_type: string;
  total_amount?: number | null;
  installments?: Installment[] | null;
}): Array<Installment & { lines: Array<{ fee_type: string; amount: number }> }> {
  const total = fee.total_amount ?? 0;
  if (total <= 0) return [];
  const parts = fee.installments?.length
    ? fee.installments
    : parseInstallments({ totalAmount: total, periodType: fee.period_type });
  const feeType = fee.fee_type || feeTypeFor(fee.name);
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
 * An index anchor carries the bare programme name; the model routinely appends the award it saw
 * on the card — "Data Science: Visualization (Individual Certificate)". `normaliseCourseName`
 * strips only the trailing ")", so the exact lookup misses every such course. Retry without a
 * trailing parenthetical. NOT fixable in normaliseCourseName itself: that is the dedup key, and
 * collapsing parentheticals would merge "Computer Science (Bachelor)" with "… (Master)".
 */
export function bareCourseKey(name: string): string | null {
  const bare = name.replace(/\s*\([^()]*\)\s*$/, "").trim();
  return bare && bare !== name.trim() ? normaliseCourseName(bare) : null;
}

export function courseOwnPage(
  links: Map<string, string>, name: string, contestedBareNames?: ReadonlySet<string>,
): string | null {
  const exact = links.get(normaliseCourseName(name));
  if (exact) return exact;
  const bare = bareCourseKey(name);
  // Two awards of one programme reduce to the same bare name. Whichever anchor the index carries,
  // it belongs to at most one of them and the name cannot say which — so neither may claim it.
  if (!bare || contestedBareNames?.has(bare)) return null;
  return links.get(bare) ?? null;
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
// A month or less is not a qualification, whatever the page calls it: every course at these levels
// running <= 4 weeks in the staged data is executive education — "Harvard Mediation Intensive",
// "Senior Executive Fellows", "Ethical Leadership". Applied ONLY to the non-degree levels, because
// a degree with a short duration is a PARSING error, not a short course (live example: "Literary
// Reportage (MFA)" stored as 2 weeks). No bachelor, graduate diploma or doctorate in the data runs
// under 35 weeks, so the degrees need no such rescue.
/** The duration the page stated for the COURSE — never inferred from a study option or prose. */
function statedDurationWeeks(course: ExtractedCourse): number | null {
  const fromText = parseDurationText(course.duration_text);
  if (fromText) return plausibleWeeks(durationToWeeks(fromText.value, fromText.unit));
  const numeric = coerceInt(course.duration_weeks);
  if (numeric != null) return plausibleWeeks(numeric);
  if (typeof course.duration_weeks === "string") {
    const p = parseDurationText(course.duration_weeks);
    if (p) return plausibleWeeks(durationToWeeks(p.value, p.unit));
  }
  return null;
}

export async function resolveCourseLookups(course: ExtractedCourse): Promise<CourseLookupLink> {
  const lists = await loadLookupLists();
  let level = resolveDegreeLevel(lists, course.degree_level, course.name);

  // Only a duration the SOURCE STATED for the course itself may demote it. resolveDurationWeeks
  // also falls back to the shortest study option and to description prose — fine for filling a
  // display field, unsafe here: a diploma offering a 4-week intensive beside a 52-week standard
  // would report 4, and under strict scoping a demotion is not a mislabel but a DELETION.
  if (shouldDemoteForDuration(level?.slug, statedDurationWeeks(course), course.name)) {
    level = lists.levels.find((l) => l.slug === "non_aqf_award") ?? level;
  }
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
function logLookupLink(
  jobId: string, courseId: string, course: ExtractedCourse, link: CourseLookupLink, inScope = true,
) {
  const entry = {
    jobId, courseId, course: course.name,
    ...(inScope ? {} : { in_scope: false }),
    degree_level: link.degree_level_code
      ? { linked: true, raw: course.degree_level ?? null, name: link.degree_level, slug: link.degree_level_code }
      : { linked: false, raw: course.degree_level ?? null },
    subject_area: link.subject_area_code
      ? { linked: true, subject: course.subject_area ?? null, area_pick: course.area_of_study ?? null, slug: link.subject_area_code }
      : { linked: false, subject: course.subject_area ?? null, area_pick: course.area_of_study ?? null },
  };
  if (!inScope) linkLogger.warn("outside the job's degree levels", entry);
  else if (link.degree_level_code && link.subject_area_code) linkLogger.info("linked", entry);
  else linkLogger.warn("unlinked", entry);
}

export async function writeCourse(jobId: string, course: ExtractedCourse, campusIdMap: Map<string, string>): Promise<string | null> {
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
  if (await skipOutOfScope(jobId, course, link.degree_level_code)) return null;

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
    const merged = {
      ...link,
      degree_level_code: link.degree_level_code ?? existing.degree_level_code,
      subject_area_code: link.subject_area_code ?? existing.subject_area_code,
    };
    logLookupLink(jobId, courseId, course, merged, await isCourseInScope(jobId, merged.degree_level_code));
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
    logLookupLink(jobId, courseId, course, link, await isCourseInScope(jobId, link.degree_level_code));
  }

  // ── Fees + assignments ──
  if (course.fees?.length) {
    for (const fee of course.fees) {
      // Tuition and the application fee only — see isExtractableFee.
      if (!isExtractableFee(fee.name)) continue;
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
      const intakeId = await upsertIntake(jobId, intake, course.source_url ?? null);
      await masterKnex(`${S}.extraction_course_intake_assignments`)
        .insert({ job_id: jobId, course_id: courseId, intake_id: intakeId })
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

      const eligId = await upsertEligibility(jobId, elig, {
        name: elig.name ?? null,
        applicable_to: elig.applicable_to ?? "both",
        description: elig.description ?? null,
        min_score_percent: isPercentage ? scoreValue : coerceInt(elig.min_score_percent),
        min_degree_level: elig.min_degree_level ?? null,
        score_type: scoreType,
        min_score: isPercentage ? null : scoreValue,
        academic_tests: JSON.stringify(normaliseAcademicTests(elig.academic_tests)),
        source_url: course.source_url ?? null,
      });
      await masterKnex(`${S}.extraction_course_eligibility_assignments`)
        .insert({ job_id: jobId, course_id: courseId, eligibility_requirement_id: eligId })
        .onConflict(["course_id", "eligibility_requirement_id"]).ignore();
    }
  }

  // ── English requirements ──
  if (course.english_requirements?.length) {
    for (const eng of course.english_requirements) {
      await upsertEnglishRequirement(jobId, courseId, eng, course.source_url ?? null);
    }
  }

  // ── Study units + assignments ──
  if (course.study_units?.length) {
    // Which of these "units" are really other courses of this job. Asked as one query over the
    // candidate names rather than by loading every course name, so a 800-course job costs the
    // same as a small one.
    const keys = [...new Set(course.study_units
      .map((u) => normaliseCourseName(u.unit_name ?? ""))
      .filter(Boolean))];
    const NORM_SQL = "regexp_replace(regexp_replace(lower(trim(name)), '\\s+', ' ', 'g'), '[^a-z0-9]+$', '')";
    const clash: Array<{ k: string }> = keys.length
      ? await masterKnex(`${S}.extraction_courses`)
        .where({ job_id: jobId })
        .whereRaw(`${NORM_SQL} = ANY(?)`, [keys])
        .select(masterKnex.raw(`${NORM_SQL} as k`))
      : [];
    const programmeNames = new Set(clash.map((r) => r.k));

    const { kept, dropped, batchRejected } = filterStudyUnits(
      course.study_units, course.name, (k) => programmeNames.has(k),
    );
    if (dropped.length) {
      logger.warn("Rejected implausible study units", {
        jobId, courseId, course: course.name, batchRejected,
        kept: kept.length, dropped: dropped.length,
        examples: dropped.slice(0, 5),
      });
    }
    for (const unit of kept) {
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
// course pipeline's own coerceInt above is untouched.
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
// The unique index is on the exact string, so "/programs" and "/programs/" queued twice.
// Also the identity test for "do these two links point at the same page?" — an index that links
// one course twice with a trailing slash or a campaign parameter must not read as two courses.
// Only unambiguous campaign tags. "ref" and "source" are deliberately absent — a catalogue can
// use them to select content, and merging two genuinely different pages is the expensive error.
const TRACKING_PARAMS = /^(utm_|fbclid$|gclid$|msclkid$|mc_cid$|mc_eid$)/i;
export function normaliseQueueUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING_PARAMS.test(key)) u.searchParams.delete(key);
    }
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) u.pathname = u.pathname.replace(/\/+$/, "");
    return u.toString();
  } catch {
    return url;
  }
}

export async function insertQueueItem(jobId: string, url: string): Promise<string | null> {
  url = normaliseQueueUrl(url);
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
