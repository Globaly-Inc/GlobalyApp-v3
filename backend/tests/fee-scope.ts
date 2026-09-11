/**
 * isExtractableFee — the writer-side half of FEE_SCOPE_RULE.
 *
 * The prompts ask for tuition and the application fee only, and two of them used to say the
 * opposite in the same request ("the tuition AND every other charge stated alongside it", plus a
 * name field whose examples included 'Material Fee' and 'Health Cover'). A model that took the
 * broader wording had its answer staged verbatim, because nothing downstream re-checked the kind.
 *
 * Pure — no database, no model. Run it directly:
 *   node --import tsx tests/fee-scope.ts
 */
import { isExtractableFee, feeTypeFor } from "../src/modules/superadmin/data-extraction/lib/staging-writer.js";

let passed = 0;
let failed = 0;

function ok(actual: boolean, expected: boolean, label: string) {
  if (actual === expected) passed++;
  else { failed++; console.error(`FAIL ${label}: expected ${expected}, got ${actual}`); }
}

// In scope: tuition under the page's own wordings, and the application fee.
for (const name of [
  "Tuition Fee", "Annual Tuition Fee", "Course Fee", "Program Fee", "Semester Fee",
  "Per Credit Rate", "Application Fee", "Application fee (non-refundable)",
  null, "", // unlabelled — feeTypeFor defaults to tuition, and a bare figure is the headline one
]) ok(isExtractableFee(name), true, `in scope: ${JSON.stringify(name)}`);

// Out of scope: every kind FEE_SCOPE_RULE tells the model to leave out of the array.
for (const name of [
  "Enrolment Fee", "Registration Fee", "Material Fee", "Books and Equipment",
  "Exam Fee", "Assessment Fee", "Late Payment Fee",
  "Health Cover", "OSHC", "Health Insurance", "Student Services Fee", "Amenities Fee (SSAF)",
]) ok(isExtractableFee(name), false, `out of scope: ${name}`);

// The predicate is exactly feeTypeFor's two in-scope kinds — it must not drift from the labels
// the fee form offers.
ok(feeTypeFor("Health Cover") === "Health Insurance Fee", true, "feeTypeFor still classifies health cover");
ok(feeTypeFor("anything unrecognised") === "Tuition Fee", true, "feeTypeFor defaults to tuition");

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
