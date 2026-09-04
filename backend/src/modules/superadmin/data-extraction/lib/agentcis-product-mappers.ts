// Per-product field extraction for AgentCIS staging (intakes, study options,
// eligibility) — split out of agentcis-staging.ts to stay under this module's
// 300-line-per-file convention. Pure functions, no I/O.

import { coerceLabel, mapDegreeLevel } from "./agentcis-mappers.js";

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

export function extractIntakes(source: Record<string, unknown>): MappedIntake[] {
  const candidates = [
    source.intakes, source.intake, source.course_intakes,
    source.available_intakes, source.start_dates, source.intake_dates,
  ];
  let rawArr: unknown[] = [];
  for (const c of candidates) {
    if (Array.isArray(c) && c.length) { rawArr = c; break; }
  }
  if (!rawArr.length) {
    if (source.intake_month != null || source.intake_year != null || source.start_date != null) {
      rawArr = [source];
    }
  }

  const out: MappedIntake[] = [];
  for (const raw of rawArr) {
    const mapped = mapOneIntake(raw);
    if (mapped) out.push(mapped);
  }
  return out;
}

function mapOneIntake(input: unknown): MappedIntake | null {
  if (input == null) return null;

  if (typeof input === "string" || typeof input === "number") {
    const s = String(input).trim();
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

  if (typeof input !== "object") return null;
  const o = input as Record<string, unknown>;

  let month: number | null = null;
  let year: number | null = null;

  const monthRaw = o.intake_month ?? o.month;
  if (typeof monthRaw === "number" && monthRaw >= 1 && monthRaw <= 12) month = monthRaw;
  else if (monthRaw != null) {
    const ms = String(monthRaw).trim().toLowerCase();
    month = MONTH_MAP[ms] ?? MONTH_MAP[ms.slice(0, 3)] ?? null;
    if (!month) { const n = Number(ms); if (n >= 1 && n <= 12) month = n; }
  }

  const yearRaw = o.intake_year ?? o.year;
  if (typeof yearRaw === "number" && yearRaw > 1900) year = yearRaw;
  else if (yearRaw != null) { const n = Number(yearRaw); if (n > 1900) year = n; }

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

function toDateStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const t = Date.parse(s);
  if (!isNaN(t)) {
    const d = new Date(t);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }
  return null;
}

// ── Study options ──

export interface MappedStudyOption {
  study_mode: string;
  study_load: string;
  duration_value: number | null;
  duration_unit: string | null;
}

const MODE_MAP: Record<string, string> = {
  "on campus": "on_campus", "on_campus": "on_campus", "on-campus": "on_campus", "campus": "on_campus",
  "classroom": "on_campus", "offline": "on_campus", "in person": "on_campus",
  "online": "online", "distance": "online", "remote": "online",
  "hybrid": "hybrid", "blended": "hybrid", "mixed": "hybrid",
};

/**
 * One value from MODE_MAP, or null. Anything the map doesn't know is dropped rather than stored:
 * the extractor has repeatedly put a study *load* ("full time") in the mode field, and a load
 * saved as a mode surfaces as a bogus filter option and a wrong chip on the institution card.
 */
export function normaliseStudyMode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  return MODE_MAP[raw.trim().toLowerCase()] ?? null;
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

  const dv = Number(p.duration_value ?? p.duration ?? 0) || null;
  const duRaw = String(p.duration_unit ?? p.duration_type ?? "weeks").toLowerCase();
  let du: string | null = null;
  if (duRaw.startsWith("year")) du = "years";
  else if (duRaw.startsWith("month")) du = "months";
  else if (duRaw.startsWith("week")) du = "weeks";
  else if (duRaw.startsWith("day")) du = "days";
  else du = dv ? "weeks" : null;

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

// ── Eligibility ──

export interface MappedEligibility {
  min_degree_level: string | null;
  min_score_percent: number | null;
  description: string | null;
}

export function extractEligibility(p: Record<string, unknown>): MappedEligibility | null {
  const degreeSources = [
    p.qualification_type, p.qualification, p.degree_level, p.degree,
    p.minimum_qualification, p.min_qualification,
    (p.academic_requirement as Record<string, unknown> | undefined)?.qualification_type,
    (p.entry_requirements as Record<string, unknown> | undefined)?.academic,
  ];

  let minDegree: string | null = null;
  for (const src of degreeSources) {
    if (!src) continue;
    const label = coerceLabel(src).toLowerCase().trim();
    minDegree = mapDegreeLevel(label);
    if (minDegree) break;
  }

  const scoreRaw = p.min_score ?? p.min_percentage ?? p.percentage ??
    (p.academic_requirement as Record<string, unknown> | undefined)?.min_score;
  const minScore = scoreRaw != null ? Number(scoreRaw) || null : null;

  const desc = typeof p.entry_requirements_description === "string"
    ? p.entry_requirements_description
    : typeof (p.academic_requirement as Record<string, unknown> | undefined)?.description === "string"
      ? ((p.academic_requirement as Record<string, unknown>).description as string)
      : null;

  if (!minDegree && minScore == null && !desc) return null;

  return { min_degree_level: minDegree, min_score_percent: minScore, description: desc };
}
