// Per-product field extraction for AgentCIS staging (intakes, study options,
// eligibility) — split out of agentcis-staging.ts to stay under this module's
// 300-line-per-file convention. Pure functions, no I/O.

import { coerceLabel, mapDegreeLevel, degreeLevelName } from "./agentcis-mappers.js";
import { coercePartialDate } from "./partial-date.js";
import { parseDurationText, type DurationUnit } from "./staging-writer.js";

// ── Intakes ──

const MONTH_MAP: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

export interface MappedIntake {
  intake_name: string | null;
  intake_month: number | null;
  intake_year: number | null;
  start_date: string | null;
  end_date: string | null;
  admission_deadline: string | null;
}

function extractRecurringIntakeMonths(monthList: unknown[]): MappedIntake[] {
  const out: MappedIntake[] = [];
  for (const raw of monthList) {
    if (!raw || typeof raw !== "object") continue;
    const label = coerceLabel((raw as Record<string, unknown>).value ?? (raw as Record<string, unknown>).name);
    if (!label) continue;
    const { month } = parseMonthYear(label);
    out.push({
      intake_name: label,
      intake_month: month,
      intake_year: null,
      start_date: null,
      end_date: null,
      admission_deadline: null,
    });
  }
  return out;
}

function findIntakeArray(source: Record<string, unknown>): unknown[] {
  const candidates = [
    source.intakes, source.intake, source.course_intakes,
    source.available_intakes, source.start_dates, source.intake_dates,
  ];
  for (const c of candidates) {
    if (Array.isArray(c) && c.length) return c;
  }
  if (source.intake_year != null || source.start_date != null) return [source];
  return [];
}

export function extractIntakes(source: Record<string, unknown>): MappedIntake[] {
  if (Array.isArray(source.intake_month)) {
    const recurring = extractRecurringIntakeMonths(source.intake_month);
    if (recurring.length) return recurring;
  }

  const out: MappedIntake[] = [];
  for (const raw of findIntakeArray(source)) {
    const mapped = mapOneIntake(raw);
    if (mapped) out.push(mapped);
  }
  return out;
}

function mapScalarIntake(raw: string | number): MappedIntake | null {
  const s = String(raw).trim();
  if (!s) return null;
  const { month, year } = parseMonthYear(s);
  if (!month && !year) return null;
  return {
    intake_name: s,
    intake_month: month,
    intake_year: year,
    start_date: null,
    end_date: null,
    admission_deadline: null,
  };
}

function resolveIntakeMonth(o: Record<string, unknown>): number | null {
  const raw = o.intake_month ?? o.month;
  if (raw == null) return null;
  if (typeof raw === "number") return raw >= 1 && raw <= 12 ? raw : null;
  const ms = coerceLabel(raw).trim().toLowerCase();
  const named = MONTH_MAP[ms] ?? MONTH_MAP[ms.slice(0, 3)];
  if (named) return named;
  const n = Number(ms);
  return n >= 1 && n <= 12 ? n : null;
}

function resolveIntakeYear(o: Record<string, unknown>): number | null {
  const raw = o.intake_year ?? o.year;
  if (raw == null) return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  return n > 1900 ? n : null;
}

function mapOneIntake(input: unknown): MappedIntake | null {
  if (input == null) return null;
  if (typeof input === "string" || typeof input === "number") return mapScalarIntake(input);
  if (typeof input !== "object") return null;
  const o = input as Record<string, unknown>;

  let month = resolveIntakeMonth(o);
  let year = resolveIntakeYear(o);

  const label = coerceLabel(o.name ?? o.label ?? o.intake_name ?? o.title);
  if (!month || !year) {
    const parsed = parseMonthYear(label);
    month = month ?? parsed.month;
    year = year ?? parsed.year;
  }

  const startDate = toDateStr(o.start_date ?? o.intake_date ?? o.starts_at);
  const endDate = toDateStr(o.end_date ?? o.ends_at);
  const deadline = toDateStr(o.application_deadline ?? o.admission_deadline ?? o.deadline);

  if (!label && !month && !year && !startDate) return null;

  return {
    intake_name: label || null,
    intake_month: month,
    intake_year: year,
    start_date: startDate,
    end_date: endDate,
    admission_deadline: deadline,
  };
}

function parseMonthYear(s: string): { month: number | null; year: number | null } {
  const txt = s.toLowerCase().trim();
  if (!txt) return { month: null, year: null };
  let month: number | null = null;
  for (const key of Object.keys(MONTH_MAP)) {
    if (new RegExp(`\\b${key}\\b`).test(txt)) { month = MONTH_MAP[key]; break; }
  }
  const yearMatch = txt.match(/\b(20\d{2}|19\d{2})\b/);
  const year = yearMatch ? Number(yearMatch[1]) : null;
  return { month, year };
}

/**
 * Intake dates go through the SAME coercer as every other writer (see lib/partial-date.ts).
 *
 * This used to be a local parser, and it was safe only because the column was `date` and Postgres
 * did the validating. Now that the column is text with a CHECK, the local version had two ways to
 * be wrong: it passed the LLM's unknown-year sentinel "0000-01-07" straight through — the exact
 * gwu.edu value Postgres used to reject outright — and a Date.parse fallback on an odd string
 * could yield a five-digit year that violates the constraint and aborts the whole import.
 *
 * Sharing the coercer also means an AgentCIS feed stating only "September 2026" now keeps the
 * month instead of discarding it, which the local parser could not express.
 */
const toDateStr = coercePartialDate;

// ── Study options ──

export interface MappedStudyOption {
  study_mode: string;
  study_load: string;
  duration_value: number | null;
  duration_unit: string | null;
}

const MODE_MAP: Record<string, string> = {
  "on campus": "on_campus", "on-campus": "on_campus", "campus": "on_campus",
  "classroom": "on_campus", "offline": "on_campus", "in person": "on_campus",
  "online": "online", "distance": "online", "remote": "online",
  "hybrid": "hybrid", "blended": "hybrid", "mixed": "hybrid",
};

export interface ParsedDuration {
  value: number | null;
  unit: DurationUnit | null;
}

export function extractCourseDuration(p: Record<string, unknown>): ParsedDuration {
  let dv: number | null = p.duration_value != null ? Number(p.duration_value) || null : null;
  let du: DurationUnit | null = null;

  if (typeof p.duration === "string" && p.duration.trim()) {
    const parsed = parseDurationText(p.duration);
    if (parsed) {
      dv = dv ?? parsed.value;
      du = parsed.unit;
    } else {
      const bare = p.duration.match(/(\d+(?:\.\d+)?)/);
      dv = dv ?? (bare ? Number(bare[1]) : null);
    }
  } else if (dv == null && p.duration != null) {
    dv = Number(p.duration) || null;
  }

  if (!du) {
    const duRaw = coerceLabel(p.duration_unit ?? p.duration_type).toLowerCase();
    if (duRaw.startsWith("year")) du = "years";
    else if (duRaw.startsWith("month")) du = "months";
    else if (duRaw.startsWith("week")) du = "weeks";
    else if (duRaw.startsWith("day")) du = "days";
  }
  du = du ?? (dv ? "weeks" : null);
  return { value: dv, unit: du };
}

export function extractStudyOptions(p: Record<string, unknown>): MappedStudyOption[] {
  const modeRaw = p.study_mode ?? p.delivery_mode ?? p.mode;
  const modeTokens = tokenize(modeRaw);
  const modes = modeTokens.map((t) => MODE_MAP[t.toLowerCase()] || null).filter(Boolean) as string[];

  const loadRaw = p.study_load ?? p.load ?? p.attendance_type;
  const loadTokens = tokenize(loadRaw);
  const loadMap: Record<string, string> = {
    "full time": "full_time", "full-time": "full_time", "fulltime": "full_time",
    "part time": "part_time", "part-time": "part_time", "parttime": "part_time",
  };
  const loads = loadTokens.map((t) => loadMap[t.toLowerCase()] || null).filter(Boolean) as string[];

  const { value: dv, unit: du } = extractCourseDuration(p);

  const mList = modes.length ? modes : ["on_campus"];
  const lList = loads.length ? loads : ["full_time"];

  const out: MappedStudyOption[] = [];
  for (const m of mList) {
    for (const l of lList) {
      out.push({ study_mode: m, study_load: l, duration_value: dv, duration_unit: du });
    }
  }
  return out;
}

function tokenize(raw: unknown): string[] {
  if (raw == null) return [];
  if (typeof raw === "string") return raw.split(/[,;/|]/).map((s) => s.trim()).filter(Boolean);
  if (Array.isArray(raw)) return raw.flatMap(tokenize);
  if (typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    return tokenize(o.name ?? o.label ?? o.value);
  }
  return [];
}

// ── Subject area & degree level ──

export interface MappedCourseTaxonomy {
  degreeLevelName: string | null;
  subjectName: string | null;
  areaName: string | null;
}

export function extractCourseTaxonomy(p: Record<string, unknown>): MappedCourseTaxonomy {
  const sal = p.subject_area_and_level as Record<string, unknown> | undefined;
  const degreeLevel = sal?.degree_level as Record<string, unknown> | undefined;
  const subject = sal?.subject as Record<string, unknown> | undefined;
  const area = sal?.subject_area as Record<string, unknown> | undefined;
  return {
    degreeLevelName: coerceLabel(degreeLevel?.name) || null,
    subjectName: coerceLabel(subject?.name) || null,
    areaName: coerceLabel(area?.name) || null,
  };
}

// ── Eligibility + test scores ──

export interface MappedAcademicTest {
  test_name: string;
  score: string | null;
}

export interface MappedEnglishTest {
  test_type_name: string;
  overall_score: string | null;
  listening_score: string | null;
  reading_score: string | null;
  writing_score: string | null;
  speaking_score: string | null;
}

export function extractOtherTestScores(raw: unknown): MappedAcademicTest[] {
  if (!raw || typeof raw !== "object") return [];
  const out: MappedAcademicTest[] = [];
  for (const [name, score] of Object.entries(raw as Record<string, unknown>)) {
    if (score == null || score === "") continue;
    out.push({ test_name: name, score: String(score) });
  }
  return out;
}

export function extractEnglishTestScores(raw: unknown): MappedEnglishTest[] {
  if (!raw || typeof raw !== "object") return [];
  const out: MappedEnglishTest[] = [];
  for (const [name, bands] of Object.entries(raw as Record<string, unknown>)) {
    if (!bands || typeof bands !== "object") continue;
    const b = bands as Record<string, unknown>;
    const pick = (v: unknown) => (v == null || v === "" ? null : String(v));
    const mapped: MappedEnglishTest = {
      test_type_name: name,
      overall_score: pick(b.Overall),
      listening_score: pick(b.Listening),
      reading_score: pick(b.Reading),
      writing_score: pick(b.Writing),
      speaking_score: pick(b.Speaking),
    };
    if (Object.values(mapped).slice(1).every((v) => v == null)) continue;
    out.push(mapped);
  }
  return out;
}

export interface MappedEligibility {
  min_degree_level: string | null;
  score_type: "percentage" | "gpa_4" | null;
  score_value: number | null;
  academic_tests: MappedAcademicTest[];
}

export function extractEligibility(p: Record<string, unknown>): MappedEligibility | null {
  const ar = p.academic_requirement as Record<string, unknown> | undefined;
  const degreeLevel = ar?.degree_level as Record<string, unknown> | undefined;
  const minDegree = degreeLevelName(mapDegreeLevel(coerceLabel(degreeLevel?.name).toLowerCase().trim()));

  const rawType = coerceLabel(ar?.academic_score_type).toLowerCase().trim();
  const scoreType: "percentage" | "gpa_4" | null =
    rawType === "percentage" ? "percentage" : rawType === "gpa" ? "gpa_4" : null;
  const scoreRaw = ar?.academic_score;
  const scoreValue = scoreRaw != null && scoreRaw !== "" ? Number(scoreRaw) || null : null;

  const academicTests = extractOtherTestScores(p.other_test_score);

  if (!minDegree && scoreValue == null && !academicTests.length) return null;

  return {
    min_degree_level: minDegree,
    score_type: scoreValue != null ? scoreType : null,
    score_value: scoreValue,
    academic_tests: academicTests,
  };
}
