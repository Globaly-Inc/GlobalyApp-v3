/**
 * What kind of entity did the extractor hand us? A programme the institution sells, or a unit,
 * module or subject that only exists inside one?
 *
 * The model's own label (entity_type) is one vote. The deterministic votes are: a unit code in the
 * name, the item already being a study unit of this job, curriculum-block vocabulary in the heading
 * path or evidence, and the ABSENCE of any qualification word. A name that states its own award
 * ("Master of ...", "BSc ...") is never reclassified as a unit no matter what the model said — a
 * hidden programme costs more than a stray unit flagged for review.
 *
 * Pure. The writer supplies the job's known unit names/codes; tests supply the fixture.
 */
import { parseCourseName } from "./course-name.js";

export type EntityVerdict = "course" | "short_course" | "specialization" | "module" | "unsupported_standalone" | "drop";

export interface EntityItem {
  name: string;
  /** Model label: course | short_course | module | specialization | other | null. */
  entity_type?: string | null;
  parent_program?: string | null;
  /** Model evidence list: own_detail_page | award_in_name | fees_stated | duration_stated | unit_code | credit_points | listed_under_program_heading. */
  evidence?: string[] | null;
  /** Headings above the item on its page, outermost first, when known. */
  heading_path?: string[] | null;
  credit_points?: number | null;
}

export interface EntityContext {
  /** How many courses the model returned for this page — 1 means the page is about this item. */
  coursesOnPage: number;
  /** Uppercased unit codes already staged for this job. */
  jobUnitCodes: ReadonlySet<string>;
  /** normaliseUnitName()-shaped unit names already staged for this job. */
  jobUnitNames: ReadonlySet<string>;
  /** The page this item was read from, when known — used only for the hub-page override below. */
  sourceUrl?: string | null;
}

export interface EntityClassification {
  verdict: EntityVerdict;
  reason: string;
  parentProgram: string | null;
  /** Unit code parsed from the name, when the verdict is module. */
  unitCode: string | null;
}

// Headings that introduce curriculum components, in any language of catalogue we have seen.
// Vocabulary, not names: "Program Courses", "Course Units", "Year 1", "Semester 2", "Electives".
const CURRICULUM_HEADING_RE = /\b(program(?:me)? courses?|course (?:units?|structure|list|outline)|study units?|units?|modules?|subjects?|curriculum|program(?:me)? structure|core (?:courses?|units?|modules?|subjects?)|required (?:courses?|coursework)|electives?|elective (?:courses?|units?)|options?|year [1-6]|level [4-7]|semester [1-4]|trimester [1-3]|term [1-4]|foundation modules?|specialisms?|papers?|coursework)\b/i;

// Words that belong to a unit's own name rather than to a programme's.
const UNIT_VOCAB_RE = /\b(practicum|internship|seminar|capstone|thesis|dissertation|independent study|fieldwork|field placement|laboratory|lab|tutorial|colloquium|workshop|project [ivx1-3]+|part [ivx1-3]+|\b[ivx]{1,3}$)\b/i;

const PROGRAMME_EVIDENCE = new Set(["own_detail_page", "award_in_name", "fees_stated", "duration_stated"]);
const UNIT_EVIDENCE = new Set(["unit_code", "credit_points", "listed_under_program_heading"]);

// A URL literally structured as a subject/department hub ("/area-of-study/<slug>",
// "/areas-of-study/<slug>") describes the DISCIPLINE, not one credentialed offering. "own_detail_page"
// ("this page is about this item alone") is true of every such hub page by construction — the page
// IS entirely about that one subject — so on its own it cannot tell a hub apart from a real program's
// detail page, and the model has no other vocabulary for the distinction. Confirmed against live
// extraction_courses data: Princeton's /academics/area-of-study/* pages alone account for most of the
// measured "bare subject vs qualified programme" pairs (see course-resolver.ts tier 2c).
const HUB_PAGE_URL_RE = /\/areas?-of-study\//i;

function normUnit(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function classifyEntity(item: EntityItem, ctx: EntityContext): EntityClassification {
  const parsed = parseCourseName(item.name);
  const statesAward = parsed.qualifier != null;
  const evidence = new Set(item.evidence ?? []);
  const label = (item.entity_type ?? "").toLowerCase() || null;
  const parent = item.parent_program?.trim() || item.heading_path?.[0]?.trim() || null;
  const code = parsed.code;
  const codeIsUnit = !!code && /^[A-Z]{2,4}\d{3,4}[A-Z]?$/.test(code);

  if (label === "other") return { verdict: "drop", reason: "model:other", parentProgram: null, unitCode: null };

  const knownUnit = (!!code && ctx.jobUnitCodes.has(code)) || ctx.jobUnitNames.has(normUnit(item.name));
  const underCurriculumHeading = (item.heading_path ?? []).some((h) => CURRICULUM_HEADING_RE.test(h))
    || evidence.has("listed_under_program_heading");
  const unitShaped = codeIsUnit || item.credit_points != null || evidence.has("unit_code") || evidence.has("credit_points")
    || UNIT_VOCAB_RE.test(item.name);
  const programmeShaped = [...evidence].some((e) => PROGRAMME_EVIDENCE.has(e));

  if (!statesAward) {
    if (knownUnit) return { verdict: "module", reason: "already_a_unit_of_this_job", parentProgram: parent, unitCode: code };
    if (label === "module") return { verdict: "module", reason: "model:module", parentProgram: parent, unitCode: code };
    if (codeIsUnit) return { verdict: "module", reason: "unit_code_in_name", parentProgram: parent, unitCode: code };
    if (underCurriculumHeading && (unitShaped || !programmeShaped)) {
      return { verdict: "module", reason: "listed_under_curriculum_heading", parentProgram: parent, unitCode: code };
    }
    if (unitShaped && !programmeShaped) return { verdict: "module", reason: "unit_shaped_no_award", parentProgram: parent, unitCode: code };
    // Deterministic override, checked BEFORE the model's own label: a confirmed hub-page URL with no
    // programme evidence beyond "own_detail_page" (which the hub trivially satisfies) is flagged for
    // review regardless of what entity_type the model gave it — unlike the label-gated check below,
    // this does not trust the model to have correctly told a hub apart from a real detail page.
    if (ctx.sourceUrl && HUB_PAGE_URL_RE.test(ctx.sourceUrl)) {
      const withoutOwnPage = [...evidence].filter((e) => e !== "own_detail_page");
      if (!withoutOwnPage.some((e) => PROGRAMME_EVIDENCE.has(e))) {
        return { verdict: "unsupported_standalone", reason: "hub_page_url", parentProgram: parent, unitCode: null };
      }
    }
    // No award, nothing unit-shaped: only standalone if this page is about it or evidence says so.
    if (ctx.coursesOnPage > 1 && !programmeShaped) {
      return { verdict: "unsupported_standalone", reason: "no_award_on_list_page", parentProgram: parent, unitCode: null };
    }
    if (ctx.coursesOnPage === 1 && !programmeShaped && evidence.size === 0 && label !== "course" && label !== "short_course") {
      return { verdict: "unsupported_standalone", reason: "no_award_no_evidence", parentProgram: parent, unitCode: null };
    }
  } else if (label === "module" || knownUnit) {
    // The model or the unit table says unit, the name says award. The name wins; note the clash.
    return { verdict: "course", reason: "award_in_name_overrides_unit_signal", parentProgram: null, unitCode: null };
  }

  if (label === "specialization" && parent) return { verdict: "specialization", reason: "model:specialization", parentProgram: parent, unitCode: null };
  if (label === "short_course") return { verdict: "short_course", reason: "model:short_course", parentProgram: null, unitCode: null };
  return { verdict: "course", reason: statesAward ? "award_in_name" : "programme_evidence", parentProgram: null, unitCode: null };
}
