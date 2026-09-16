/**
 * snapshotPathFor — GCS object path for a site-snapshot page (one file per page, per site).
 * Pure. Run: npm run test:site-snapshot-path
 */
import { fileLinksOf, snapshotPathFor } from "../src/modules/superadmin/data-extraction/lib/site-snapshot.js";

let failed = 0;
function eq(url: string, expected: string) {
  const got = snapshotPathFor(url);
  if (got !== expected) { failed++; console.error(`FAIL ${url}\n  expected ${expected}\n  got      ${got}`); }
}

eq("https://www.mit.edu/", "extraction/www/mit.edu/www.mit.edu/index.md");
eq("https://catalog.mit.edu/about/overview/", "extraction/www/mit.edu/catalog.mit.edu/about_overview.md");
eq("https://www.ox.ac.uk/Admissions/Fees.aspx?year=2027", "extraction/www/ox.ac.uk/www.ox.ac.uk/admissions_fees.md");
eq("https://som.ku.edu.np/programs/MBA%20(Evening)", "extraction/www/ku.edu.np/som.ku.edu.np/programs_mba-evening.md");
eq("https://example.edu/a//b/index.html#top", "extraction/www/example.edu/example.edu/a_b_index.md");

const files = fileLinksOf([
  "https://x.edu/brochure.pdf", "https://x.edu/logo.png?v=2", "https://x.edu/brochure.pdf",
  "https://x.edu/about/", "https://x.edu/app.js", "https://x.edu/fees.xlsx#sheet1",
]);
const wantFiles = ["https://x.edu/brochure.pdf", "https://x.edu/logo.png?v=2", "https://x.edu/fees.xlsx#sheet1"];
if (JSON.stringify(files) !== JSON.stringify(wantFiles)) { failed++; console.error(`FAIL fileLinksOf\n  got ${JSON.stringify(files)}`); }

if (failed) process.exit(1);
console.log("site-snapshot-path: all passed");
