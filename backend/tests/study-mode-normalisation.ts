/**
 * normaliseStudyModes() regression test — extraction output is not schema-enforced, so the
 * LLM has put a study *load* ("full time") in the study_mode field and compound values
 * ("On-campus, Online") in it too. The old staging-writer coerced both to "on_campus",
 * publishing a delivery-mode chip and filter match the source never claimed.
 * Run: node --import tsx tests/study-mode-normalisation.ts
 */
process.env.DB_USERNAME = process.env.DB_USERNAME || "x";
process.env.DB_PASSWORD = process.env.DB_PASSWORD || "x";
process.env.DB_NAME = process.env.DB_NAME || "x";
process.env.JWT_SECRET = process.env.JWT_SECRET || "x";

let passed = 0;
let failed = 0;

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

async function main() {
  const { normaliseStudyModes } = await import("../src/modules/superadmin/data-extraction/lib/agentcis-product-mappers.js");

  assertEqual(normaliseStudyModes("full time"), [], "a study load in the mode field yields no mode, not on_campus");
  assertEqual(normaliseStudyModes("Weekend"), [], "an unknown mode yields no mode, not on_campus");
  assertEqual(normaliseStudyModes("On-campus, Online"), ["on_campus", "online"], "a compound value keeps both modes");
  assertEqual(normaliseStudyModes("online / on campus"), ["online", "on_campus"], "slash-separated compounds split too");
  assertEqual(normaliseStudyModes("Blended"), ["hybrid"], "a known synonym still maps");
  assertEqual(normaliseStudyModes("campus, on-campus"), ["on_campus"], "duplicate modes collapse to one");
  assertEqual(normaliseStudyModes(["Online", "Hybrid"]), ["online", "hybrid"], "an array of modes is handled");
  assertEqual(normaliseStudyModes(null), [], "null yields no mode");

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
