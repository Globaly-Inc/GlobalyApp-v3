// Spreadsheet row → AgentCIS product shape. A mapped sheet row states the same things an AgentCIS
// product does (duration text, intake month names, English scores, an entry degree, a per-period
// fee × instalments), so instead of a second writer the row is reshaped and handed to
// agentcis-product-staging's stageProduct — one set of fee/intake/eligibility/English writes.
// Pure: tests/spreadsheet-import.ts exercises it against real sheet rows.

import { MODE_MAP } from "./agentcis-product-mappers.js";
import type { SpreadsheetCourseRow } from "../schemas/spreadsheet-import.schema.js";

/** A sheet fee with no currency is USD (user decision) — without this, stageProduct's AgentCIS
 * fallback would label it AUD. */
export const DEFAULT_CURRENCY = "USD";

/** Stands in for a website when the sheet gives none — same idea as AgentCIS's synthetic URL. */
export const SPREADSHEET_SYNTHETIC_URL_PREFIX = "https://import.globalyhub.local/institution/";

/** Typos real sheets carry ("High Shool" — 37 rows in the first workbook imported). */
export function normaliseDegreeLabel(v: string | null): string | null {
  if (!v) return null;
  if (/^high\s*sc?h?o+l$/i.test(v.trim())) return "High School";
  return v.trim();
}

const num = (v: string | null) => {
  if (v == null) return null;
  const s = v.replace(/[,\s]/g, "").replace(/^[^\d.-]+/, "");
  const n = Number(s);
  return s && Number.isFinite(n) ? n : null;
};

/** Band order in a comma-separated English score cell: "6.5, 6, 6, 6, 5.5". */
export const ENGLISH_BAND_ORDER = ["Overall", "Listening", "Reading", "Writing", "Speaking"] as const;

/** "6.5" → overall only; "6.5, 6, 6, 6, 5.5" → every band; blanks ("6.5,,,6") stay unstated.
 * Keys match AgentCIS's english_test_score bands, which extractEnglishTestScores reads. */
export function englishBands(v: string | null): Record<string, string> | null {
  if (!v) return null;
  const parts = v.split(",").map((p) => p.trim());
  const bands = Object.fromEntries(ENGLISH_BAND_ORDER.map((b, i) => [b, parts[i]]).filter(([, p]) => p));
  return Object.keys(bands).length ? bands : null;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const monthOf = (w: string) => { const i = MONTHS.indexOf(w.slice(0, 3).toLowerCase()); return i < 0 ? null : i + 1; };
const fullYear = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));

/**
 * One intake cell → intakes, each token on its own: "Aug" (month only), "Sep 26" / "Sep 2026"
 * (month + year — a 2-digit number after the month is the YEAR, as in "Jan 27, Mar 28"), and
 * "1 Sep 26" (day + month + year → a start date). Handed to stageProduct as `intakes`, which
 * extractIntakes maps like any structured intake list. A token with no month is dropped.
 */
export function parseIntakeCell(v: string | null) {
  const out: { intake_name: string; intake_month: number; intake_year: number | null; start_date: string | null }[] = [];
  for (const token of (v ?? "").split(/[,;/|]+/).map((s) => s.trim()).filter(Boolean)) {
    const m = token.match(/^(?:(\d{1,2})\s+)?([a-z]{3,9})\.?(?:\s+(\d{2}|\d{4}))?$/i);
    const month = m ? monthOf(m[2]!) : null;
    if (!m || !month) continue;
    const year = m[3] ? fullYear(m[3]) : null;
    const day = m[1] ? Number(m[1]) : null;
    out.push({
      intake_name: token,
      intake_month: month,
      intake_year: year,
      // A day without a year can't be dated; the month still stands.
      start_date: day && year ? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` : null,
    });
  }
  return out;
}

const EMBEDDED_MODE = /\b(on[\s-]campus|in[\s-]person|online|distance|remote|hybrid|blended)\b/i;
const LOAD_WORDS = /^(full[\s-]?time|part[\s-]?time)$/i;
const AUDIENCE_WORDS = /^(domestic|international|both)$/i;

/**
 * A duration cell that is really a whole study option — "On Campus, Full Time, 4 Years, Both" —
 * split into its parts; a plain "4 Years" passes straight through. The audience word ("Both") has
 * nowhere to go on a study option (the importer doesn't set applies-to) and is dropped.
 */
export function parseDurationCell(v: string | null) {
  const parts = (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  // A part that is exactly a mode word the course writer reads (MODE_MAP: Remote, In Person…) is the
  // mode. Only with none does a longer part lend one ("4 Years Online" stays the duration and passes
  // "online" on — the course writer matches whole tokens), and then only a teaching word: a bare
  // "Campus" there is a place ("4 Years at City Campus").
  const isMode = (p: string) => !!MODE_MAP[p.toLowerCase()];
  const modes = parts.filter(isMode);
  if (!modes.length) {
    for (const p of parts) {
      const m = p.match(EMBEDDED_MODE)?.[0].toLowerCase().replace("-", " ");
      if (m && MODE_MAP[m] && !modes.includes(m)) modes.push(m);
    }
  }
  const loads = parts.filter((p) => LOAD_WORDS.test(p));
  const rest = parts.filter((p) => !isMode(p) && !LOAD_WORDS.test(p) && !AUDIENCE_WORDS.test(p));
  return {
    duration: rest.join(", ") || null,
    study_mode: modes.join(", ") || null,
    study_load: loads.join(", ") || null,
  };
}

/** "Main Campus, City Campus" / "Main; City" → names, blanks dropped. Inner spaces are collapsed so
 * a name keys the same in stageBranches and in stageProduct's campus lookup. */
export const splitList = (v: string | null) => (v ?? "").split(/[,;]/).map((s) => s.trim().replace(/\s+/g, " ")).filter(Boolean);

/** Fee lines at a per-period rate. Each carries its own student type and period, which
 * stageProduct honours over the group's (AgentCIS lines carry neither, so they're unchanged). */
function feeItems(row: SpreadsheetCourseRow) {
  const tuition = { instalment: num(row.fee_installments) ?? 1, fee_type: { name: row.fee_name ?? "Tuition Fee" } };
  const items: Record<string, unknown>[] = [];
  const intl = num(row.fee_amount), dom = num(row.domestic_fee_amount), app = num(row.application_fee_amount);
  if (intl) items.push({ ...tuition, amount: intl, student_type: "international" });
  if (dom) items.push({ ...tuition, amount: dom, student_type: "domestic" });
  if (app) {
    items.push({
      amount: app, instalment: num(row.application_fee_installments) ?? 1, student_type: "both",
      fee_type: { name: row.application_fee_name ?? "Application Fee" }, period: row.application_fee_period ?? "Total",
    });
  }
  return items;
}

export function rowToProduct(row: SpreadsheetCourseRow, defaultCurrency: string | null): Record<string, unknown> {
  const items = feeItems(row);
  const duration = parseDurationCell(row.duration);
  const minScore = num(row.min_score);
  const english: Record<string, Record<string, string>> = {};
  for (const [test, v] of [["IELTS", row.ielts], ["TOEFL", row.toefl], ["PTE", row.pte], ["DUOLINGO", row.duolingo]] as const) {
    const bands = englishBands(v);
    if (bands) english[test] = bands;
  }

  return {
    name: row.course_name,
    short_name: row.short_name,
    description: row.course_description,
    url: row.course_url,
    branches: splitList(row.branch_names).map((name) => ({ name })),
    awarding_institution: row.awarding_institution,
    // A Study Mode column wins over a mode written inside the duration cell.
    study_mode: row.study_mode ?? duration.study_mode,
    study_load: duration.study_load,
    duration: duration.duration,
    subject_area_and_level: {
      degree_level: { name: normaliseDegreeLabel(row.degree_level) },
      // A sheet's "Subject Area" is the broad area; it fills both, as AgentCIS's subject/area pair.
      subject: { name: row.subject_area },
      subject_area: { name: row.subject_area },
    },
    intakes: parseIntakeCell(row.intake_months),
    english_test_score: english,
    academic_requirement: {
      degree_level: { name: normaliseDegreeLabel(row.min_degree_level) },
      academic_score: minScore,
      academic_score_type: row.score_type,
    },
    other_test_score: { GRE: row.gre, GMAT: row.gmat, "SAT I": row.sat_1, "SAT II": row.sat_2 },
    // Every `amount` is per period (e.g. per semester); stageProduct stores amount × instalment.
    fees: items.length ? { currency: row.fee_currency ?? defaultCurrency, feeTerms: { name: row.fee_period }, fee_items: items } : undefined,
  };
}
