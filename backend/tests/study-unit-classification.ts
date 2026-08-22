/**
 * Study-unit vs course classification test.
 * Covers two fixes: (1) courseExtractionPrompt tells the LLM not to extract a lone
 * subject/unit page as a course, (2) normaliseUnitName gives study-unit dedup the
 * same stable key that normaliseCampusName already gives campus dedup.
 * Run: node --import tsx tests/study-unit-classification.ts
 *
 * Style matches tests/scraper-cascade.ts: plain tsx script, manual counters, no framework.
 */

process.env.DB_USERNAME = process.env.DB_USERNAME || "x";
process.env.DB_PASSWORD = process.env.DB_PASSWORD || "x";
process.env.DB_NAME = process.env.DB_NAME || "x";
process.env.JWT_SECRET = process.env.JWT_SECRET || "x";

let passed = 0;
let failed = 0;

function assert(cond: boolean, label: string) {
  if (cond) passed++;
  else { failed++; console.error(`FAIL: ${label}`); }
}

async function main() {
  const { courseExtractionPrompt, studyUnitsFromPagePrompt } = await import("../src/modules/superadmin/data-extraction/lib/extraction-prompts.js");
  const { normaliseUnitName } = await import("../src/modules/superadmin/data-extraction/lib/staging-writer.js");
  const { looksLikeCourseUrl, filterUrls } = await import("../src/modules/superadmin/data-extraction/lib/html-utils.js");

  // 1. Prompt tells the LLM to exclude standalone unit/subject pages from courses.
  const prompt = courseExtractionPrompt("https://uni.example/units/COMP101", "COMP101 — Introduction to Databases");
  assert(/SUBJECT\/UNIT\/MODULE/i.test(prompt), "prompt warns against extracting a unit page as a course");
  assert(/return an empty courses array/i.test(prompt), "prompt tells the LLM to return no courses for a unit page");

  // 2. Prompt asks for a curriculum_page_url so the worker can follow it
  // (docs/data-extraction/2026-08-21-study-units-discovery-design.md). It must be
  // flagged even when the page already named a few units — an admissions/overview
  // page routinely lists 1-2 example courses while the real curriculum page has the
  // full set (seen live: UC Berkeley's MIDS/MICS admissions page named 2 of ~15
  // courses each, and the old "only if empty" wording never asked for the rest).
  assert(/curriculum_page_url/.test(prompt), "prompt requests curriculum_page_url");
  assert(/EVEN IF you already found some study_units/i.test(prompt), "prompt asks for curriculum_page_url even when some units were already found");
  const unitsPrompt = studyUnitsFromPagePrompt("https://uni.example/programs/se", "COMP101, COMP102");
  assert(/study_units/.test(unitsPrompt), "secondary-page prompt asks only for study_units");

  // 3. normaliseUnitName collapses whitespace/casing so re-extractions dedup correctly.
  assert(
    normaliseUnitName("Introduction to Databases") === normaliseUnitName("  introduction   to  databases  "),
    "normaliseUnitName treats casing/whitespace variants as the same unit",
  );
  assert(
    normaliseUnitName("Introduction to Databases") !== normaliseUnitName("Advanced Databases"),
    "normaliseUnitName does not collapse genuinely different units",
  );

  // 4. looksLikeCourseUrl regression — found live in job b290bd10-d0c3-4971-9d41-3d5a9bccccfb
  // (University of California): the whole admission.universityofcalifornia.edu subdomain
  // was queued as "course pages" because "/admission" matched the HOSTNAME by string
  // coincidence ("https://admission..." contains "/admission" right after "://"), and
  // "/study" matched unrelated news-headline slugs like "study-finds-x-causes-y".
  assert(
    !looksLikeCourseUrl("https://admission.universityofcalifornia.edu/tuition-financial-aid/how-aid-works.html"),
    "an /admission-hostname page with no course signal in its path is excluded",
  );
  assert(
    !looksLikeCourseUrl("https://www.universityofcalifornia.edu/news/study-believe-it-or-not-humans-are-kind"),
    "a research-study news headline is not treated as a program-of-study page",
  );
  assert(
    looksLikeCourseUrl("https://www.ucla.edu/academics/programs-and-majors"),
    "a genuine /academics/programs-and-majors page is still included",
  );
  assert(
    looksLikeCourseUrl("https://uni.example/study/bachelor-of-arts"),
    "a genuine /study/ path segment is still included",
  );

  // 5. filterUrls excludes news/press-room outright — the "-programs" URL signal
  // legitimately matches headline slugs ("uc-graduate-programs-and-schools..."), and
  // without this the LLM fabricated 17 distinct "courses" from one ranking article
  // (same live job as above).
  const filtered = filterUrls(
    [
      "https://www.universityofcalifornia.edu/news/uc-graduate-programs-and-schools-among-nations-best-2023-24-us-news-best-graduate-schools",
      "https://www.universityofcalifornia.edu/press-room/undergraduate-applications-reach-all-time-high",
      "https://www.universityofcalifornia.edu/academics/programs-and-majors",
    ],
    "https://www.universityofcalifornia.edu/",
  );
  assert(!filtered.some((u) => u.includes("/news/")), "news articles are filtered out before the course heuristic runs");
  assert(!filtered.some((u) => u.includes("/press-room/")), "press releases are filtered out before the course heuristic runs");
  assert(filtered.some((u) => u.includes("/academics/")), "a genuine academics/programs page still survives the filter");

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
