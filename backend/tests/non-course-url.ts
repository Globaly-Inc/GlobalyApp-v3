/**
 * looksLikeNonCourseUrl — the infrastructure deny-list. Pure, no network.
 * Run: npm run test:non-course-url
 *
 * Every DENY case below is a real URL this pipeline queued, scraped and sent to Gemini. They
 * produced one course between them. The deny-list exists because a catalogue HOST short-circuits
 * looksLikeCourseUrl to true before any path is read, so `catalog.<uni>.edu/<anything>` was a
 * course page by definition.
 *
 * The KEEP half matters more than the deny half: a deny-list that quietly eats real programme
 * pages costs courses, which is far worse than the money it saves. Each KEEP case is either a
 * documented past regression or a category measured as productive.
 */
import { compileBlocklist, looksLikeCourseUrl, looksLikeNonCourseUrl } from "../src/modules/superadmin/data-extraction/lib/html-utils.js";

let passed = 0;
let failed = 0;
function ok(cond: boolean, label: string) {
  if (cond) passed++;
  else { failed++; console.error(`FAIL ${label}`); }
}

// ── DENY: real URLs, all on a catalogue host, all zero-yield ──────────────────────────────
for (const url of [
  "https://catalog.yale.edu/departmental_academic_support/appxtender",
  "https://catalog.yale.edu/departmental_academic_support/yale_hub",
  "https://catalog.yale.edu/departmental_academic_support/registration_add_drop/ycps",
  "https://catalog.yale.edu/departmental_academic_support/courseleaf/wen/set_up_sections",
  "https://catalog.yale.edu/handbook-instructors-undergraduates-yale-college/grading",
  "https://catalog.yale.edu/architecture/yale-university-resources-services/cultural-resources",
]) {
  ok(looksLikeNonCourseUrl(url), `deny: ${url.slice(28, 88)}`);
  // The point of the exercise — the catalogue-host short-circuit must not override the deny.
  ok(!looksLikeCourseUrl(url), `not a course URL despite the catalogue host: ${url.slice(28, 70)}`);
}

// Generic boilerplate, any institution.
for (const url of [
  "https://www.example.edu/policies/code-of-conduct",
  "https://catalog.example.edu/architecture/university-policy-statements",
]) ok(looksLikeNonCourseUrl(url), `deny generic: ${url}`);

// ── The collision guard. THIS IS THE POINT OF THE FILE. ──────────────────────────────────
// Every URL below is a shape a real university publishes. A first cut of the deny-list carried
// the bare words "library", "privacy", "accessibility", "calendar" and "/directory" and threw
// EIGHT of these away — for 26 pages of benefit out of 250. A denied page costs a few cents; a
// denied programme costs a course that never appears. Any future marker must keep these green.
for (const url of [
  "https://www.example.edu/programs/master-of-library-science",
  "https://catalog.example.edu/programs/library-and-information-science",
  "https://www.example.edu/academics/library-media-specialist",
  "https://www.example.edu/programs/privacy-and-data-protection-law",
  "https://catalog.example.edu/law/privacy-law-llm",
  "https://www.example.edu/programs/accessibility-and-inclusive-design",
  "https://www.example.edu/courses/web-accessibility-certificate",
  "https://catalog.example.edu/programs/calendar-and-event-management",
  "https://www.example.edu/programs/directory-services-administration",
  "https://www.example.edu/programs/master-in-public-policy",
  "https://www.example.edu/academics/policy-studies",
  "https://www.example.edu/handbook/undergraduate-programs",
  "https://www.example.edu/programs/human-resources-management",
]) ok(!looksLikeNonCourseUrl(url), `REAL DEGREE must survive: ${url.replace("https://", "")}`);

// ── KEEP: must still be treated as course URLs ───────────────────────────────────────────
// explorecourses.stanford.edu/search IS a course search — this is why "/search" is not denied.
ok(looksLikeCourseUrl("https://explorecourses.stanford.edu/search?q=CS"), "Stanford explorecourses search survives");
ok(looksLikeCourseUrl("https://catalogs.uky.edu/preview_program.php?catoid=18&poid=8191"), "plural catalogue host survives");
ok(looksLikeCourseUrl("https://catalog.mit.edu/some-program"), "singular catalog host survives");
ok(looksLikeCourseUrl("https://catalog.yale.edu/ycps/majors-in-yale-college/"), "a real catalogue programme page survives");
ok(looksLikeCourseUrl("https://uni.example/study/bachelor-of-arts"), "/study/ programme page survives");
ok(looksLikeCourseUrl("https://www.ucla.edu/academics/programs-and-majors"), "programmes index survives");
ok(looksLikeCourseUrl("https://university.edu/courses/bachelor-of-arts"), "plain course path survives");

// Measured as productive, so explicitly NOT denied.
for (const url of [
  "https://www.example.edu/people/faculty-research",       // 20 pages -> 43 courses
  "https://www.example.edu/admissions/tuition-and-fees",   // 2 pages -> 6 courses
  "https://www.example.edu/registrar/course-offerings",    // 9 pages -> 6 courses
]) ok(!looksLikeNonCourseUrl(url), `kept despite low yield: ${url}`);

// Scholarship / funding pages ARE denied (2026-09-24). The 2 courses that 32 such pages once
// yielded were the failure this fixes — a scholarship page lists the degrees the award can be held
// with, and the course prompt stages one course per listed degree with the award's own criteria as
// its "entry requirement" (Curtin's Global Scholars Program page became 30 such courses).
for (const url of [
  "https://www.example.edu/financial-aid/scholarships",
  "https://curtin.edu.au/study/international-students/global-scholars-program",
  "https://curtin.edu.au/study/international-students/curtin-english/curtin-english-scholarship",
  "https://uni.example/study/bursaries",
]) ok(looksLikeNonCourseUrl(url), `scholarship page denied: ${url}`);
// …but a programme whose SUBJECT is scholarship-adjacent is not.
ok(!looksLikeNonCourseUrl("https://uni.example/courses/master-of-financial-planning"), "financial planning programme survives");

// A word appearing in a HOSTNAME must not deny the URL — the hostname-bleed bug, mirrored.
ok(!looksLikeNonCourseUrl("https://library.example.edu/programs/bachelor-of-science"),
   "a denied word in the HOSTNAME does not deny the path");
ok(looksLikeCourseUrl("https://library.example.edu/programs/bachelor-of-science"),
   "...and that page is still a course URL");


// ── url_blocklist_patterns: one bad regex must not take the good ones (or the whole step) down ──
{
  const { patterns, invalid } = compileBlocklist(["/news/", "[", "\\.pdf$", "(unclosed"]);
  ok(patterns.length === 2 && invalid.length === 2 && invalid.includes("[") && invalid.includes("(unclosed"), "compileBlocklist keeps the valid patterns and reports the invalid ones");
  ok(patterns[0].test("https://x.edu/NEWS/2027") && patterns[1].test("https://x.edu/fees.PDF"), "compiled patterns are case-insensitive, like the page worker's always were");
  ok(compileBlocklist([]).patterns.length === 0, "an empty list compiles to nothing");
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
