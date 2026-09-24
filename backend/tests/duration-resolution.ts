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

  // Component durations (a placement, module, internship) must not be mistaken for the whole
  // course's length (review finding, 2026-09-15) — the "duration:"/"lasts"/"X full-time" cues
  // have no course-word anchor, so a component's own stated length can satisfy them too.
  eq(w.durationFromProse("Placement duration: 6 months."), null, "a labelled COMPONENT duration ('Placement duration:') is not the course length");
  eq(w.durationFromProse("Each module lasts 10 weeks."), null, "'module... lasts' is a component cue, not a course-length one");
  eq(w.durationFromProse("The final-year project is 6 months full-time."), null, "a component named right before a full-time figure is still rejected");
  eq(w.durationFromProse("There is a 3-month internship in year 2."), null, "an internship's own duration is not the course length");
  // But a genuine course-length statement must still work even when some OTHER, unrelated
  // component duration is mentioned elsewhere in the very same sentence — the guard is a narrow
  // window around the matched figure, not a blanket "sentence mentions a component" veto.
  eq(w.durationFromProse("This MSc lasts 2 years full-time, with a 3-month placement in year 2."), { value: 2, unit: "years" }, "the course's own 'lasts 2 years' cue still wins even though 'placement' appears later in the same sentence");

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

  // Two awards of one programme both reduce to "computer science". The index carries a single
  // anchor for it, which belongs to at most one of them — so NEITHER may take it, or one award's
  // curriculum and duration is staged onto the other.
  const contested = new Set(["computer science"]);
  eq(w.courseOwnPage(links, "Computer Science (Bachelor)", contested), null, "a contested bare name is refused…");
  eq(w.courseOwnPage(links, "Computer Science (Master)", contested), null, "…for every award that claims it");
  eq(w.courseOwnPage(links, "Computer Science", contested), "https://x.edu/cs", "an EXACT anchor match is still that course's own page");
  eq(w.courseOwnPage(links, "Data Science: Visualization (Individual Certificate)", contested), "https://x.edu/course/dsv", "an uncontested name is unaffected");

  eq(w.bareCourseKey("Computer Science (Bachelor)"), "computer science", "the bare key drops a trailing award");
  eq(w.bareCourseKey("Computer Science"), null, "a name with no parenthetical has no separate bare key");

  // Study options helper
  eq(w.weeksFromStudyOptions([{ name: "On Campus", duration_value: 3, duration_unit: "years" }]), 156, "single option without load");
  eq(w.weeksFromStudyOptions([]), null, "no options");

  // On-campus is a second, independent qualifying signal alongside full-time (2026-09-15) — an
  // on-campus option is the "standard" way to take a course just as much as a full-time one is.
  // Each case below deliberately makes the on-campus/part-time option NOT the shortest of the
  // set, so a fix that just widened the "take the shortest of everything" fallback (rather than
  // actually preferring on-campus-or-full-time) would still get these wrong.
  eq(w.weeksFromStudyOptions([
    { name: "Online", study_mode: "online", study_load: "part_time", duration_value: 1, duration_unit: "years" },
    { name: "On Campus", study_mode: "on_campus", study_load: "part_time", duration_value: 3, duration_unit: "years" },
  ]), 156, "on-campus (part-time, not full-time) wins over a shorter online part-time option");
  eq(w.weeksFromStudyOptions([
    { name: "Online Fast-Track", study_mode: "online", study_load: "full_time", duration_value: 2, duration_unit: "years" },
    { name: "On Campus", study_mode: "on_campus", study_load: "part_time", duration_value: 4, duration_unit: "years" },
  ]), 104, "full-time (even online) still qualifies and, being shorter, wins over the on-campus part-time option");
  eq(w.weeksFromStudyOptions([
    { name: "Distance Learning", study_mode: "online", study_load: "part_time", duration_value: 5, duration_unit: "years" },
  ]), 260, "neither on-campus nor full-time present -> falls back to the only option, not dropped");
  eq(w.weeksFromStudyOptions([
    { name: "On-Campus", study_mode: null, study_load: "part_time", duration_value: 3, duration_unit: "years" },
    { name: "Remote", study_mode: "online", study_load: "part_time", duration_value: 1, duration_unit: "years" },
  ]), 156, "on-campus recognised from the option's own name (study_mode blank) still wins over a shorter, non-on-campus, non-full-time option");

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
