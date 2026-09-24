/**
 * looksLikeCourseUrl() regression test — reproduces a real bug: the University of
 * Kentucky publishes its Acalog course catalog at catalogs.uky.edu (plural), which the
 * catalogueHost check only matched in its singular form ("catalog."), so
 * https://catalogs.uky.edu/preview_program.php?catoid=18&poid=8191 — the ABSN program's
 * own catalog entry, and the only page with its actual fee schedule — was never treated
 * as a course URL and got filtered out of the crawl.
 * Run: node --import tsx tests/catalogue-host-url.ts
 */
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
  const { looksLikeCourseUrl } = await import("../src/modules/superadmin/data-extraction/lib/html-utils.js");

  assertEqual(
    looksLikeCourseUrl("https://catalogs.uky.edu/preview_program.php?catoid=18&poid=8191&returnto=1031"),
    true,
    "plural catalog host (catalogs.uky.edu) is recognized as a course URL",
  );
  assertEqual(looksLikeCourseUrl("https://catalog.mit.edu/some-program"), true, "singular catalog host still matches");
  assertEqual(looksLikeCourseUrl("https://catalogue.example.edu/x"), true, "singular catalogue host still matches");
  assertEqual(looksLikeCourseUrl("https://catalogues.example.edu/x"), true, "plural catalogue host matches");
  assertEqual(
    looksLikeCourseUrl("https://catalogshopping.example.edu/x"),
    false,
    "a host that merely starts with 'catalog' but isn't one is not a false positive",
  );
  assertEqual(
    looksLikeCourseUrl("https://admission.example.edu/apply"),
    false,
    "an unrelated subdomain with no course signal in the path is still rejected",
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
