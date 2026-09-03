/**
 * normaliseScoreType() / deriveScoreFromDescription() regression test — reproduces the
 * real bug: an eligibility requirement with description "Minimum undergraduate GPA of
 * 3.0." was staged with score_type/min_score/min_score_percent all null, even though the
 * description states the figure plainly. Also guards the DB CHECK constraint on
 * score_type (percentage|gpa_4|gpa_10|cgpa) — the admin UI used to offer "gpa"/"grade",
 * neither of which the DB accepts.
 * Run: node --import tsx tests/eligibility-score.ts
 */
process.env.DB_USERNAME = process.env.DB_USERNAME || "x";
process.env.DB_PASSWORD = process.env.DB_PASSWORD || "x";
process.env.DB_NAME = process.env.DB_NAME || "x";
process.env.JWT_SECRET = process.env.JWT_SECRET || "x";

let passed = 0;
let failed = 0;

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

async function main() {
  const { normaliseScoreType, deriveScoreFromDescription } = await import(
    "../src/modules/superadmin/data-extraction/lib/staging-writer.js"
  );

  // normaliseScoreType: only the real DB enum survives.
  assertEqual(normaliseScoreType("percentage"), "percentage", "a valid score_type passes through");
  assertEqual(normaliseScoreType("gpa_4"), "gpa_4", "gpa_4 passes through");
  assertEqual(normaliseScoreType("gpa"), null, "the old broken UI value 'gpa' is rejected, not passed to the DB");
  assertEqual(normaliseScoreType("grade"), null, "the old broken UI value 'grade' is rejected, not passed to the DB");
  assertEqual(normaliseScoreType(null), null, "null stays null");

  // deriveScoreFromDescription: the real reported case.
  const gwu = deriveScoreFromDescription("Minimum undergraduate GPA of 3.0.");
  assertEqual(gwu?.score_type, "gpa_4", "a bare GPA mention defaults to the 4.0 scale");
  assertEqual(gwu?.value, 3.0, "the GPA figure is extracted from the description");

  const pct = deriveScoreFromDescription("Applicants must have a minimum of 65% in their prior qualification.");
  assertEqual(pct?.score_type, "percentage", "a % figure is classified as percentage");
  assertEqual(pct?.value, 65, "the percentage figure is extracted");

  const cgpa = deriveScoreFromDescription("Minimum CGPA of 7.5 required.");
  assertEqual(cgpa?.score_type, "cgpa", "an explicit CGPA mention is classified as cgpa, not gpa_4");
  assertEqual(cgpa?.value, 7.5, "the CGPA figure is extracted");

  const gpa10 = deriveScoreFromDescription("A GPA of 7 out of 10 is required.");
  assertEqual(gpa10?.score_type, "gpa_10", "a GPA explicitly out of 10 is classified as gpa_10, not the gpa_4 default");
  assertEqual(gpa10?.value, 7, "the gpa_10 figure is extracted");

  assertEqual(deriveScoreFromDescription("A strong academic record is expected."), null, "no number stated returns null, never a guess");
  assertEqual(deriveScoreFromDescription(null), null, "null description returns null");

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
