/**
 * Curriculum tables, parsed out of the HTML instead of read back off a model.
 *
 * CourseLeaf (Leepfrog) renders a programme's curriculum as `table.sc_courselist`: one row per
 * course with its code, title and credit hours, `areaheader` rows naming each requirement block
 * and a `listsum` row carrying the total. Johns Hopkins, Georgia Tech and a large share of US
 * university catalogues all publish it, so one parser serves them all.
 *
 * Why this exists rather than asking the model:
 *   - Johns Hopkins' programme pages render the whole catalogue navigation tree inline. The
 *     markdown the scraper produces for one page is ~155,000 characters of school/department
 *     links, the curriculum sits past the 120,000-character truncation point, and the tables do
 *     not survive the HTML→markdown conversion at all (one pipe character in the whole file).
 *     Every JHU course came out with zero study units while 48 rows of real curriculum sat in
 *     the page.
 *   - Where the model DOES read a curriculum it loses the parts only the markup carries: the
 *     code, the credit hours, and which requirement block the row was under. Georgia Tech's
 *     tables gave 31 units per course with codes and credits; a prose read of Harvard gave 10
 *     per course, bare lowercase, no code, no credits.
 *
 * Pure: HTML in, units out. No network, no model, no database.
 */
import { normaliseCourseName, normaliseUnitType, type ExtractedStudyUnit } from "./staging-writer.js";

/** A parsed unit keeps the requirement block it came from, as unit_type. */
export interface ParsedCurriculum {
  units: ExtractedStudyUnit[];
  /** The programme's own total, from the table's `listsum` row, when it states one. */
  totalCredits: number | null;
}

/**
 * Course code shapes seen across CourseLeaf catalogues:
 *   AS.110.108   Johns Hopkins (school.department.number)
 *   MATH 1552    Georgia Tech, and most others
 *   EN 530.101   department-with-space, dotted number
 *   ART H 400    a two-word department
 * A code is short, upper-case and numeric-tailed; anything else in the code column is a comment
 * row ("One FYS or Design Cornerstone course"), which is not a linkable unit.
 */
const CODE_RE = /^(?:[A-Z]{2,5}\.\d{2,3}\.\d{2,4}|[A-Z][A-Z&]{1,7}(?: [A-Z]{1,4})? ?\d{3,4}[A-Z]?(?:\.\d{2,4})?)$/;

/** Cheap test before paying for a fetch or a parse. */
export function looksLikeCourseList(html: string): boolean {
  return html.includes("sc_courselist");
}

function cellText(cell: string): string {
  return cell
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&rsquo;|&#8217;/g, "'")
    .replace(/&ndash;|&#8211;/g, "-").replace(/&mdash;|&#8212;/g, "—")
    .replace(/&[a-z]+;|&#\d+;/g, "")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Requirement blocks are named in two places, and a catalogue uses one or the other:
 * Georgia Tech names them in `tr.areaheader` rows INSIDE the table; Johns Hopkins names them in
 * an `<h*>` heading immediately BEFORE the table and has no areaheader rows at all. Tracking
 * the nearest preceding heading is what lets "CORE REQUIREMENTS", "CaSE TECHNICAL ELECTIVES"
 * and "FREE ELECTIVES" reach unit_type on a JHU page.
 */
const HEADING_OR_TABLE_RE =
  /<(h[1-6])[^>]*>([\s\S]{0,200}?)<\/\1>|<table[^>]*class="[^"]*sc_courselist[^"]*"[\s\S]*?<\/table>/g;

export function parseCourseList(html: string): ParsedCurriculum {
  const units: ExtractedStudyUnit[] = [];
  const seen = new Set<string>();
  let section: string | null = null;
  // Every stated total, so a page that only gives per-block subtotals can be told apart from
  // one that gives the programme's own. JHU's Civil Engineering page states eight different
  // subtotals (2-3, 16-20, 13-14, 3-4, 23, 22, 13, 6) and no programme total — picking any one
  // of them, or their maximum, would publish a subtotal as the degree's credit requirement.
  const totals = new Set<number>();

  for (const m of html.matchAll(HEADING_OR_TABLE_RE)) {
    if (m[1]) { section = cellText(m[2]) || section; continue; }
    const table = m[0];
    for (const row of table.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? []) {
      const cls = row.match(/<tr[^>]*class="([^"]*)"/)?.[1] ?? "";
      // The header row is rendered for no-script clients only.
      if (/\bhidden\b/.test(cls)) continue;

      const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) => cellText(m[1]));
      if (!cells.length) continue;

      const isTotalRow = /^total credit(?: hour)?s?$/i.test(cells[0] ?? "");
      if (/listsum/.test(cls) || isTotalRow) {
        const n = Number(cells[cells.length - 1]?.match(/\d+/)?.[0]);
        if (Number.isFinite(n) && n > 0) totals.add(n);
        continue;
      }
      if (/areaheader|areasubheader/.test(cls)) {
        if (cells[0]) section = cells[0];
        continue;
      }

      // `orclass` rows are alternatives to the row above ("or AS.110.106"); they are real
      // choices a student can take, so they are kept — with the "or " marker stripped.
      const code = (cells[0] ?? "").replace(/^or\s+/i, "").trim();
      if (!CODE_RE.test(code)) continue;
      const title = (cells[1] ?? "")
        // A trailing footnote marker ("Professional Writing and Ethics 1") is part of the
        // catalogue's apparatus, not the course title.
        .replace(/\s+\d{1,2}$/, "")
        .trim();
      if (!title) continue;
      if (seen.has(code)) continue;
      seen.add(code);

      units.push({
        unit_code: code,
        unit_name: title,
        credit_points: parseCreditHours(cells[2] ?? ""),
        unit_type: normaliseUnitType(section),
      });
    }
  }
  // One stated total is the programme's; several are block subtotals, and there is no honest way
  // to pick or add them up, so the field stays empty and the credit requirement is not asserted.
  return { units, totalCredits: totals.size === 1 ? [...totals][0] : null };
}

/**
 * Every programme this page links to, keyed by the anchor's own text.
 *
 * A catalogue index page names 10-20 programmes and links each to its own page, and the
 * pipeline previously reached those pages only when the model happened to flag a
 * `curriculum_page_url` per course. On Johns Hopkins' `/programs/` index it did not: 18 of 19
 * courses were staged with the index itself as their source_url and no curriculum at all, while
 * the index carried an exact-name link to each one (1,202 anchors, every staged course among
 * them). Recovering the link from the markup is both cheaper and more reliable than asking the
 * model to emit fifteen URLs.
 *
 * Keyed on the same normalisation writeCourse dedupes course names by, so a stray trailing
 * bracket or a doubled space cannot hide the match.
 */
/**
 * credit_points is an INTEGER column, so a variable-credit cell ("2-3", "1-6") and a fractional
 * one ("4.5") cannot be stored without inventing a figure the page never published. Taking the
 * first integer would publish the lower bound as exact, and a markup hit suppresses the model
 * fallback, so that guess would become authoritative. Both return null instead.
 */
export function parseCreditHours(cell: string): number | null {
  const s = cell.trim();
  if (/\d\s*(?:[-–—]|to)\s*\d/.test(s)) return null;   // a range
  if (/\d+\.\d/.test(s)) return null;                   // a fraction
  const n = Number(s.match(/\d+/)?.[0]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function courseLinksByName(html: string, baseUrl: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of html.matchAll(/<a[^>]+href="([^"#][^"]*)"[^>]*>([\s\S]{0,200}?)<\/a>/g)) {
    const text = cellText(m[2]);
    // A programme name is a phrase, not a nav word; the cap keeps a stray block of prose out.
    if (text.length < 6 || text.length > 160) continue;
    const key = normaliseCourseName(text);
    if (!key || out.has(key)) continue;
    try {
      out.set(key, new URL(m[1], baseUrl).toString());
    } catch {
      // A malformed href on a page is not a reason to lose the rest of the index.
    }
  }
  return out;
}
