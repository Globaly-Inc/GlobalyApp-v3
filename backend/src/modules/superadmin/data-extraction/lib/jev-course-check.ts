// Jev checks every extracted course against its page before writeCourse stores it — TypeSafe's
// extract → verify → act pattern. One request per course, every question in parallel:
//   - lookups: a degree level / subject area that does not link to our closed lists gets a Jev
//     `choice` over the REAL list (or none), so the writer links it instead of leaving it unlinked;
//   - every fee, intake, entry requirement, English score and study unit gets a narrow noul framed
//     so TRUE = wrong for THIS course (another programme's figure, a deadline, paperwork, a figure
//     the page does not state). Only items Jev is sure are wrong are dropped, and each drop is
//     reported on the job timeline, so a reviewer sees exactly what the check removed;
//   - the course itself: P(not an enrollable programme) — flagged for review, never dropped here
//     (entity-classifier owns that decision).
//
// ON whenever TYPESAFE_API_KEY is set (JEV_VERIFY_DROP_MIN / JEV_LOOKUP_MIN override the defaults,
// "0" = off). A failed call changes nothing.

import { choice, noul } from "@typesafe-ai/sdk";
import { createChildLogger } from "../../../../shared/logger.js";
import { _jevDeps, jevThreshold } from "./jev-client.js";
import { resolveAreaOfStudy, resolveDegreeLevel, type LookupLists } from "./lookup-catalog.js";
import type { ExtractedCourse } from "./staging-writer.js";

const logger = createChildLogger("jev-course-check");

/** ~12k tokens of page, inside Jev's 32k budget for state + the longest question. */
const PAGE_CHARS = 48_000;
/** One request carries every question; past this the tail of a long unit list goes unchecked. */
const MAX_ITEM_QUESTIONS = 80;
const NONE = "none";

export const _courseCheckDeps = {
  dropMin: (): number | null => jevThreshold("JEV_VERIFY_DROP_MIN"),
  lookupMin: (): number | null => jevThreshold("JEV_LOOKUP_MIN"),
};

type ListKey = "fees" | "intakes" | "eligibility" | "english_requirements" | "study_units";

/** What each list holds, and what "wrong for this course" means for it. */
const ITEM_RULES: Record<ListKey, string> = {
  fees: "NOT the tuition fee or application fee of `course.name` as this page states it — e.g. another programme's fee, a deposit, accommodation, insurance, or an amount the page does not state",
  intakes: "NOT a term or date a student can START `course.name` on — e.g. an application deadline, exam, orientation, holiday, another programme's intake, or a date the page does not state",
  eligibility: "NOT an admission requirement of `course.name` — e.g. scholarship criteria, application paperwork, visa or immigration rules, inherent requirements, or a requirement of another programme",
  english_requirements: "NOT an English-language test score this page states for admission to `course.name`",
  study_units: "NOT a subject or module taught within `course.name` — e.g. another programme, a department, a degree name, or a career outcome",
};

export interface CheckOutcome {
  dropped: Array<{ list: ListKey; item: string; p: number }>;
  linked: { degree_level?: string; area_of_study?: string };
  notProgramme: number | null;
  /** notProgramme reached the drop threshold — reported for review, the course is still written. */
  flagged: boolean;
}

const label = (list: ListKey, item: Record<string, unknown>): string =>
  String(
    list === "fees" ? `${item.name ?? "fee"} ${item.total_amount ?? ""} ${item.currency ?? ""} (${item.student_type ?? ""})`
      : list === "intakes" ? `${item.intake_name ?? ""} ${item.start_date ?? ""}`
        : list === "english_requirements" ? `${item.test_type_name ?? item.test_type ?? ""} ${item.overall_score ?? ""}`
          : list === "study_units" ? `${item.unit_code ?? ""} ${item.unit_name ?? ""}`
            : item.name ?? item.description ?? "",
  ).replace(/\s+/g, " ").trim();

/**
 * Check `course` against the page it came from, in place. Returns what changed (for the job event),
 * or null when the check is off, found nothing, or failed.
 */
export async function checkCourseWithJev(course: ExtractedCourse, markdown: string, lists: LookupLists): Promise<CheckOutcome | null> {
  const dropMin = _courseCheckDeps.dropMin();
  const lookupMin = _courseCheckDeps.lookupMin();
  if ((dropMin == null && lookupMin == null) || !course.name) return null;

  const questions: Record<string, ReturnType<typeof noul> | ReturnType<typeof choice>> = {};
  const items: Array<{ key: string; list: ListKey; index: number; text: string }> = [];

  if (dropMin != null) {
    questions.not_programme = noul(
      "Is `course.name` NOT a programme a student can enrol in (a degree, diploma, certificate or short course) — " +
      "for example a single unit or module, a department, a research group, or a scholarship?",
    );
    for (const list of Object.keys(ITEM_RULES) as ListKey[]) {
      (course[list] as Array<Record<string, unknown>> | undefined)?.forEach((item, index) => {
        if (items.length >= MAX_ITEM_QUESTIONS) return;
        const key = `${list}_${index}`;
        items.push({ key, list, index, text: label(list, item) });
        questions[key] = noul(`Is ${list.replace(/_/g, " ")} item \`checks.${key}\` ${ITEM_RULES[list]}?`);
      });
    }
  }

  const needsLevel = lookupMin != null && !resolveDegreeLevel(lists, course.degree_level, course.name) && lists.levels.length;
  const needsArea = lookupMin != null && !resolveAreaOfStudy(lists, course.area_of_study, course.subject_area, course.name) && lists.areas.length;
  if (needsLevel) {
    questions.degree_level = choice("Which degree level is `course.name`, as this page describes it?",
      { ...Object.fromEntries(lists.levels.map((l) => [l.name, null])), [NONE]: "None of these fits" });
  }
  if (needsArea) {
    questions.area_of_study = choice("Which subject area does `course.name` belong under?",
      { ...Object.fromEntries(lists.areas.map((a) => [a.name, null])), [NONE]: "None of these fits" });
  }
  if (!Object.keys(questions).length) return null;

  let answers: Record<string, { noul?: number; choice?: string; confidence?: number }>;
  try {
    ({ answers } = await _jevDeps.systemOne({
      state: {
        course: { name: course.name, degree_level: course.degree_level ?? null, subject_area: course.subject_area ?? null },
        checks: Object.fromEntries(items.map((i) => [i.key, i.text])),
        page: markdown.slice(0, PAGE_CHARS),
      },
      questions,
    }) as unknown as { answers: typeof answers });
  } catch (err) {
    logger.warn("Jev course check failed; storing the course unchecked", { course: course.name, err: err instanceof Error ? err.message : String(err) });
    return null;
  }

  const notProgramme = answers.not_programme?.noul ?? null;
  const outcome: CheckOutcome = { dropped: [], linked: {}, notProgramme, flagged: notProgramme != null && dropMin != null && notProgramme >= dropMin };

  if (dropMin != null) {
    const drop = new Map<ListKey, Set<number>>();
    for (const i of items) {
      const p = answers[i.key]?.noul;
      if (p == null || p < dropMin) continue;
      if (!drop.has(i.list)) drop.set(i.list, new Set());
      drop.get(i.list)!.add(i.index);
      outcome.dropped.push({ list: i.list, item: i.text, p });
    }
    for (const [list, idx] of drop) {
      (course as unknown as Record<ListKey, unknown[]>)[list] = (course[list] as unknown[]).filter((_, n) => !idx.has(n));
    }
  }

  const pick = (key: "degree_level" | "area_of_study") => {
    const a = answers[key];
    return a?.choice && a.choice !== NONE && (a.confidence ?? 0) >= (lookupMin ?? 1) ? a.choice : null;
  };
  const level = needsLevel ? pick("degree_level") : null;
  const area = needsArea ? pick("area_of_study") : null;
  if (level) { course.degree_level = level; outcome.linked.degree_level = level; }
  if (area) { course.area_of_study = area; outcome.linked.area_of_study = area; }

  return outcome.dropped.length || level || area || outcome.flagged ? outcome : null;
}
