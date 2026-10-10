// Adapters between a visitor's jsonb record entries and the Personal Profile's own record types.
//
// The popups are the source of truth for what a record IS, so the visitor side does not get its
// own forms or its own field names — it borrows the profile's dialogs whole and translates at
// the edges. That translation is this file, and it is only three differences deep:
//
//   1. `id` — the dialogs use it to tell "edit this one" from "add a new one", and to key rows.
//      A jsonb array has no ids, so position IS identity. Synthesised on the way in, dropped on
//      the way out.
//   2. `sort_order` — a column on the platform_user_* tables. An array is already ordered, so a
//      stored order would be a second one, free to disagree. Defaulted in, dropped out.
//   3. blanks — a popup submits "" for every field left alone. `""` in jsonb reads back as an
//      answer of nothing rather than no answer, so it is dropped (the backend drops it too;
//      doing it here as well keeps the optimistic array identical to what comes back).

import type {
  AcademicTest, AcademicTestInput, LanguageTest, LanguageTestInput,
  Qualification, QualificationInput, WorkExperience, WorkExperienceInput,
} from "@/app/personal/apis/types";
import type { VisitorProfileEntry } from "../apis/types";

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/**
 * Sub-score keys, as the popups spell them.
 *
 * The popups key each input by `label.toLowerCase().replace(/[^a-z]+/g, "_")` — "Writing" is
 * `writing`, "Reading & Writing" is `reading_writing` (test-score-dialog / academic-test-dialog).
 * The extractor mostly emits that already, but not always ("Writing", "reading & writing"), so
 * every key is put through the popups' own transform. Anything else shows an empty input for a
 * score that exists, and saving strands the original key beside the new one.
 *
 * Two spellings of one skill collapse to one key here, later value winning.
 */
function canonicalSubScores(raw: unknown): Record<string, string> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== "string" || !value) continue;
    out[key.toLowerCase().replace(/[^a-z]+/g, "_").replace(/^_|_$/g, "")] = value;
  }
  return Object.keys(out).length ? out : null;
}

/** Drops the keys a popup left blank, plus the two the visitor row does not store. */
function toEntry(input: Record<string, unknown>): VisitorProfileEntry {
  const out: VisitorProfileEntry = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === "sort_order" || key === "id") continue;
    if (value === "" || value === null || value === undefined) continue;
    if (key === "sub_scores") {
      const scores = canonicalSubScores(value);
      if (scores) out[key] = scores;
      continue;
    }
    out[key] = value as VisitorProfileEntry[string];
  }
  return out;
}

// ── jsonb entry → the shape a popup expects ──────────────────────────────────

export function toQualification(entry: VisitorProfileEntry, index: number): Qualification {
  return {
    id: String(index),
    qualification_type: str(entry.qualification_type),
    degree_title: str(entry.degree_title),
    subject_area: str(entry.subject_area),
    institution_name: str(entry.institution_name),
    grading_system: str(entry.grading_system),
    grade_value: str(entry.grade_value),
    is_current: entry.is_current === true,
    start_date: str(entry.start_date),
    end_date: str(entry.end_date),
    sort_order: index,
  };
}

export function toWorkExperience(entry: VisitorProfileEntry, index: number): WorkExperience {
  return {
    id: String(index),
    job_title: str(entry.job_title) ?? "",
    organization_name: str(entry.organization_name),
    is_current: entry.is_current === true,
    start_date: str(entry.start_date),
    end_date: str(entry.end_date),
    sort_order: index,
  };
}

function toTest(entry: VisitorProfileEntry, index: number) {
  return {
    id: String(index),
    // The popups offer exactly two states and default to "completed"; an entry the extractor
    // never labelled is a score somebody quoted, which is the completed case.
    test_status: str(entry.test_status) ?? "completed",
    test_type: str(entry.test_type),
    overall_score: str(entry.overall_score),
    test_date: str(entry.test_date),
    sub_scores: canonicalSubScores(entry.sub_scores),
    sort_order: index,
  };
}

export const toLanguageTest = (entry: VisitorProfileEntry, index: number): LanguageTest => toTest(entry, index);
export const toAcademicTest = (entry: VisitorProfileEntry, index: number): AcademicTest => toTest(entry, index);

// ── popup submission → jsonb entry ───────────────────────────────────────────

export const fromQualification = (input: QualificationInput): VisitorProfileEntry => toEntry({ ...input });
export const fromWorkExperience = (input: WorkExperienceInput): VisitorProfileEntry => toEntry({ ...input });
export const fromLanguageTest = (input: LanguageTestInput): VisitorProfileEntry => toEntry({ ...input });
export const fromAcademicTest = (input: AcademicTestInput): VisitorProfileEntry => toEntry({ ...input });

/**
 * The section's new contents after an add or an edit.
 *
 * Every action sends the WHOLE list, so add/edit/delete are one operation the server sees three
 * ways. `index === null` appends. Delete is just `list.filter((_, i) => i !== index)`.
 */
export function replaceEntry(
  list: VisitorProfileEntry[] | null,
  index: number | null,
  entry: VisitorProfileEntry,
): VisitorProfileEntry[] {
  const current = list ?? [];
  if (index === null) return [...current, entry];
  return current.map((existing, i) => (i === index ? entry : existing));
}
