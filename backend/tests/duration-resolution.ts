/**
 * duration_weeks resolution — reproduces the 2026-09-04 audit gap: only 221 of 1,918 staged
 * courses had a duration although the page (duration_text), the course's own study options,
 * or its description stated one. One resolver now serves the writer, the re-extract step and
 * the backfill script.
 * Run: node --import tsx tests/duration-resolution.ts
 */
process.env.DB_USERNAME = process.env.DB_USERNAME || "x";
process.env.DB_PASSWORD = process.env.DB_PASSWORD || "x";
process.env.DB_NAME = process.env.DB_NAME || "x";
process.env.JWT_SECRET = process.env.JWT_SECRET || "x";

let passed = 0;
let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) passed++;
  else { failed++; console.error(`FAIL: ${label} — expected ${e}, got ${a}`); }
}

async function main() {
  const w = await import("../src/modules/superadmin/data-extraction/lib/staging-writer.js");

  // Order of trust
  eq(w.resolveDurationWeeks({ duration_weeks: 3, duration_text: "3 years full-time" }), 156, "verbatim text beats the model's number (3 was years, not weeks)");
  eq(w.resolveDurationWeeks({ duration_weeks: 104, duration_text: null }), 104, "numeric weeks used when no text");
  eq(w.resolveDurationWeeks({ duration_weeks: "18 months" as unknown as number, duration_text: null }), 78, "duration_weeks returned as text is parsed");
  eq(w.resolveDurationWeeks({ duration_weeks: null, duration_text: null, study_options: [
    { name: "Part-time", study_load: "part_time", duration_value: 4, duration_unit: "years" },
    { name: "Full-time", study_load: "full_time", duration_value: 2, duration_unit: "years" },
  ] }), 104, "shortest full-time option wins over part-time");
  eq(w.resolveDurationWeeks({ duration_weeks: null, duration_text: null, study_options: [
    { name: "Online", study_load: null, duration_value: null, duration_unit: null, duration_text: "4 years part-time" },
  ] }), 208, "an option's duration_text counts when no full-time option exists");
  eq(w.resolveDurationWeeks({ duration_weeks: null, duration_text: null, description: "This MSc is delivered over one year full-time. Applicants need two years of work experience." }), 52, "description cue picks the course length, not the work-experience figure");
  eq(w.resolveDurationWeeks({ duration_weeks: null, duration_text: null, description: "A four-year programme with a 10-week placement in year 3." }), 208, "'four-year programme' beats the placement length");
  eq(w.resolveDurationWeeks({ duration_weeks: null, duration_text: null, description: "Applicants need two years of work experience." }), null, "a bare work-experience figure is not a course duration");
  eq(w.resolveDurationWeeks({ duration_weeks: 9000, duration_text: null }), null, "implausible value (over 10 years) is dropped");
  eq(w.resolveDurationWeeks({ duration_weeks: null, duration_text: null }), null, "nothing stated stays null");

  // Prose cues
  eq(w.durationFromProse("Duration: 18 months"), { value: 18, unit: "months" }, "'Duration:' cue");
  eq(w.durationFromProse("The course lasts three years."), { value: 3, unit: "years" }, "'lasts' cue with number word");
  eq(w.durationFromProse("Complete the programme in 2 years full-time or 4 years part-time."), { value: 2, unit: "years" }, "first figure of a full/part-time split");
  eq(w.durationFromProse("Two-year MSc in Data Science"), { value: 2, unit: "years" }, "hyphenated year + award");
  eq(w.durationFromProse("Graduates earn on average 5 years after"), null, "no cue → null");

  // Real page markdown — a course found on an index has its length only on its OWN page.
  // Harvard Online states "Course Length / 8 weeks" beside two per-week figures and a related
  // -course rail; the cue must pick the programme length and ignore the effort figures.
  const HARVARD_ONLINE = [
    "Individual Course", "Data Science: Visualization", "===",
    "Course Length", "", "8 weeks", "", "1-2 hours a week", "",
    "Certificate Price:", "$ 219", "On demand",
    "Related courses", "### Data Science: Capstone", "Start today \u2022 15-20 hours a week",
    "### Data Science: Probability", "Start today \u2022 1-2 hours a week",
  ].join("\n");
  eq(w.durationFromProse(HARVARD_ONLINE), { value: 8, unit: "weeks" }, "'Course Length / 8 weeks' beats the hours-per-week figures around it");

  // The opposite direction: an NYU bulletin overview genuinely states no length, and mining it
  // must stay silent rather than reach for a number elsewhere on the page.
  const NYU_BULLETIN = [
    "Bioethics (MA)", "Program Description",
    "Founded through NYU's Center for Bioethics, the Master of Arts in Bioethics degree at GPH is",
    "one of the first programs in the world to promote a broad conception of bioethics.",
    "Admissions", "All applicants are required to submit three letters of recommendation.",
  ].join("\n");
  eq(w.durationFromProse(NYU_BULLETIN), null, "a page that states no length yields none");

  // The index anchor carries the bare programme name; the model appends the award off the card.
  // normaliseCourseName strips only the trailing ")", so the exact lookup missed EVERY such
  // course — including the harvardonline set this recovery was built for.
  const links = new Map<string, string>([
    ["data science: visualization", "https://x.edu/course/dsv"],
    ["computer science", "https://x.edu/cs"],
  ]);
  eq(w.courseOwnPage(links, "Data Science: Visualization"), "https://x.edu/course/dsv", "an exact name still matches");
  eq(w.courseOwnPage(links, "Data Science: Visualization (Individual Certificate)"), "https://x.edu/course/dsv", "a trailing award parenthetical does not block the match");
  eq(w.courseOwnPage(links, "Computer Science (Bachelor)"), "https://x.edu/cs", "…for any trailing parenthetical");
  eq(w.courseOwnPage(links, "Nursing (Graduate)"), null, "a course the page does not link stays unmatched");
  eq(w.courseOwnPage(links, "(Individual Certificate)"), null, "a name that is ONLY a parenthetical never matches everything");

  // Study options helper
  eq(w.weeksFromStudyOptions([{ name: "On Campus", duration_value: 3, duration_unit: "years" }]), 156, "single option without load");
  eq(w.weeksFromStudyOptions([]), null, "no options");

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
