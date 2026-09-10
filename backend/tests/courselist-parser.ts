/**
 * courselist-parser — reading a curriculum out of a CourseLeaf catalogue's markup instead of
 * back off a model. Pure: HTML in, units out.
 *
 * The fixtures are trimmed from the two live shapes this had to serve on 2026-09-09:
 *   - Georgia Tech names each requirement block in a `tr.areaheader` row INSIDE the table and
 *     states one programme total in a `listsum` row,
 *   - Johns Hopkins has no areaheader rows at all: block names are `<h*>` headings before the
 *     table, and each table carries its OWN "Total Credits" row.
 *
 * What this guards:
 *   - code, title and credit hours survive, in both the dotted (AS.110.108) and spaced
 *     (MATH 1552) code shapes,
 *   - a comment row in the code column ("One FYS or Design Cornerstone course") is not a unit,
 *   - `or` alternatives are kept as real choices, without the "or " marker,
 *   - the requirement block reaches unit_type from either place, and stays null when the block
 *     name says nothing about whether it is required,
 *   - ONE stated total is the programme's; SEVERAL are block subtotals and the field stays null
 *     rather than publishing a subtotal as the degree's credit requirement.
 *
 * Run it directly:
 *   node --import tsx tests/courselist-parser.ts
 */
import {
  parseCourseList, looksLikeCourseList, courseLinksByName, parseCreditHours } from "../src/modules/superadmin/data-extraction/lib/courselist-parser.js";

let passed = 0;
let failed = 0;

function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) passed++;
  else { failed++; console.error(`FAIL: ${label} — expected ${e}, got ${a}`); }
}

// ── Georgia Tech: areaheader rows inside the table, one listsum total ──
const GATECH = `
<div id="requirementstextcontainer">
<table class="sc_courselist">
<thead><tr class="hidden noscript"><th>Code</th><th>Title</th><th>Credit Hours</th></tr></thead>
<tbody>
<tr class="even areaheader firstrow"><td colspan="2"><span class="courselistcomment areaheader">Core courses</span></td><td class="hourscol"></td></tr>
<tr class="odd"><td class="codecol"><a class="bubblelink code">APPH 1040</a></td><td>Scientific Foundations of Health</td><td class="hourscol">2</td></tr>
<tr class="orclass odd"><td class="codecol orclass">or <a class="bubblelink code">APPH 1050</a></td><td colspan="2">The Science of Physical Activity and Health</td></tr>
<tr class="even"><td class="codecol"><a class="bubblelink code">MATH 1552</a></td><td>Integral Calculus <sup>1</sup></td><td class="hourscol">4</td></tr>
<tr class="odd areaheader"><td colspan="2"><span class="courselistcomment areaheader">Technical Electives</span></td><td class="hourscol"></td></tr>
<tr class="even"><td class="codecol"><a class="bubblelink code">AE 4803</a></td><td>Special Topics</td><td class="hourscol">3</td></tr>
<tr class="odd"><td colspan="2"><span class="courselistcomment">One FYS or Design Cornerstone course</span></td><td class="hourscol">2-3</td></tr>
<tr class="listsum"><td>Total Credit Hours</td><td class="hourscol">131</td></tr>
</tbody></table></div>`;

const gt = parseCourseList(GATECH);
eq(looksLikeCourseList(GATECH), true, "a CourseLeaf page is recognised");
eq(gt.units.map((u) => u.unit_code), ["APPH 1040", "APPH 1050", "MATH 1552", "AE 4803"], "spaced codes, or-alternatives kept, comment row dropped");
eq(gt.units[0].unit_name, "Scientific Foundations of Health", "the title comes through");
eq(gt.units[2].unit_name, "Integral Calculus", "a footnote marker is not part of the title");
eq(gt.units[2].credit_points, 4, "credit hours come through");
eq(gt.units[1].credit_points, null, "an alternative with no hours of its own stays null");
eq(gt.units.map((u) => u.unit_type), ["compulsory", "compulsory", "compulsory", "elective"], "the areaheader block reaches unit_type");
eq(gt.totalCredits, 131, "one stated total is the programme's");

// ── Johns Hopkins: heading before the table, a total per block ──
const JHU = `
<div id="twozerotwofourrequirementstextcontainer">
<h3>CORE REQUIREMENTS</h3>
<table class="sc_courselist">
<thead><tr class="hidden noscript"><th>Code</th><th>Title</th><th>Credits</th></tr></thead>
<tbody>
<tr class="even firstrow"><td class="codecol"><a class="bubblelink code">AS.110.108</a></td><td>Calculus I (Physical Sciences &amp; Engineering)</td><td class="hourscol">4</td></tr>
<tr class="odd"><td class="codecol"><a class="bubblelink code">EN.661.110</a></td><td>Professional Writing and Ethics <sup>1</sup></td><td class="hourscol">3</td></tr>
<tr class="odd areasubheader"><td colspan="2">Total Credits</td><td class="hourscol">23</td></tr>
</tbody></table>
<h3>CaSE TECHNICAL ELECTIVES</h3>
<table class="sc_courselist">
<tbody>
<tr class="even firstrow"><td class="codecol"><a class="bubblelink code">EN.560.240</a></td><td>Uncertainty, Reliability and Decision-making</td><td class="hourscol">3</td></tr>
<tr class="odd areasubheader"><td colspan="2">Total Credits</td><td class="hourscol">6</td></tr>
</tbody></table></div>`;

const jhu = parseCourseList(JHU);
eq(jhu.units.map((u) => u.unit_code), ["AS.110.108", "EN.661.110", "EN.560.240"], "dotted JHU codes parse");
eq(jhu.units[0].unit_name, "Calculus I (Physical Sciences & Engineering)", "entities are decoded");
eq(jhu.units.map((u) => u.unit_type), ["compulsory", "compulsory", "elective"], "the preceding heading reaches unit_type");
eq(jhu.totalCredits, null, "two different totals are block subtotals — the programme total is not asserted");

// ── A block name that says nothing about requirement leaves unit_type alone ──
const NEUTRAL = `<h3>FA1 WRITING AND COMMUNICATION</h3>
<table class="sc_courselist"><tbody>
<tr class="even firstrow"><td class="codecol">AS.004.101</td><td>Reintroduction to Writing</td><td class="hourscol">3</td></tr>
</tbody></table>`;
eq(parseCourseList(NEUTRAL).units[0].unit_type, null, "an unlabelled block does not assert compulsory");

// ── Nothing to parse ──
eq(looksLikeCourseList("<p>no catalogue here</p>"), false, "a page with no course list is not one");
eq(parseCourseList("<p>no catalogue here</p>"), { units: [], totalCredits: null }, "…and parses to nothing rather than throwing");

// ── Programme links off an index page ──
const INDEX = `<ul>
<li><a href="/arts-sciences/degree-programs/anthropology/anthropology-bachelor-arts/">Anthropology, Bachelor of Arts</a></li>
<li><a href="/public-health/departments/biostatistics/biostatistics-phd/">Biostatistics, PhD</a></li>
<li><a href="/azindex/">AZ Index</a></li>
<li><a href="#skip">Skip to Content</a></li>
</ul>`;
const links = courseLinksByName(INDEX, "https://e-catalogue.jhu.edu/programs/");
eq(
  links.get("anthropology, bachelor of arts"),
  "https://e-catalogue.jhu.edu/arts-sciences/degree-programs/anthropology/anthropology-bachelor-arts/",
  "a programme link is keyed by its own name, resolved absolute",
);
eq(links.get("biostatistics, phd")?.endsWith("/biostatistics-phd/"), true, "…for every programme on the index");
eq(links.has("skip to content"), false, "an in-page anchor is never a programme link");
// A nav entry like "AZ Index" does land in the map, and that is harmless by design: the caller
// looks a course up by its exact name, so an entry no course is named can never be matched.
// Filtering it out would need a heuristic for "looks like a programme name", and a wrong one
// would drop real programmes — the expensive mistake, not this one.
eq(links.has("az index"), true, "nav entries are not filtered — the exact-name lookup makes them unreachable");

// The same anchor text under two sections — an index listing one programme name under both
// Undergraduate and Graduate. Keeping whichever came first hands one award's page to the other,
// so the name is dropped entirely: no link beats the wrong link.
const DUPLICATE_NAMES = `<ul>
<li><a href="/undergrad/computer-science/">Computer Science</a></li>
<li><a href="/grad/computer-science/">Computer Science</a></li>
<li><a href="/arts/anthropology-ba/">Anthropology, Bachelor of Arts</a></li>
</ul>`;
const dup = courseLinksByName(DUPLICATE_NAMES, "https://x.edu/programs/");
eq(dup.has("computer science"), false, "one name pointing at two different pages resolves to neither");
eq(dup.get("anthropology, bachelor of arts")?.endsWith("/anthropology-ba/"), true, "…while every unambiguous programme on the same index survives");

// A card that links the same programme twice (image + title) is NOT ambiguous — same target.
const REPEATED_LINK = `<ul>
<li><a href="/programs/biology/"><img alt="Biology"/>Biology Programme</a>
    <a href="/programs/biology/">Biology Programme</a></li>
</ul>`;
eq(
  courseLinksByName(REPEATED_LINK, "https://x.edu/").get("biology programme"),
  "https://x.edu/programs/biology/",
  "the same href twice under one name is one link, not a conflict",
);


// Credit hours: the column is an INTEGER, so anything that cannot be one is left unknown rather
// than published as the lower bound — a markup hit suppresses the model fallback, so a guess here
// would be authoritative.
eq(parseCreditHours("3"), 3, "a plain integer");
eq(parseCreditHours("3 credits"), 3, "an integer with trailing words");
eq(parseCreditHours("2-3"), null, "a range is unknown, not its lower bound");
eq(parseCreditHours("1 - 6"), null, "…spaced");
eq(parseCreditHours("1 to 6"), null, "…worded");
eq(parseCreditHours("4.5"), null, "a fraction an integer column cannot hold");
eq(parseCreditHours("Variable"), null, "no figure at all");
eq(parseCreditHours(""), null, "empty");
eq(parseCreditHours("0"), null, "zero is not a credit value");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
