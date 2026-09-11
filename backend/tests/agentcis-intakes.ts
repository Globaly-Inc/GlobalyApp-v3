/**
 * Guards for the intakes an AgentCIS product states. No DB, no network.
 *
 *   npm run test:agentcis-intakes
 *
 * Real bug (2026-09-10, Anglia Ruskin / Victoria University): AgentCIS states a product's intakes
 * as `intake_month: [{ id: 3, value: "April" }, …]`, and `[]` when the partner ticked none.
 * `extractIntakes` read neither shape — so every stated month was dropped, and because `[]` is not
 * `null` the fallback mapped the PRODUCT itself as an intake, giving each of the institution's 103
 * courses one dateless intake named after the course.
 *
 * The payloads below are copied from live API responses, ids included.
 */

import { extractIntakes } from "../src/modules/superadmin/data-extraction/lib/agentcis-product-mappers.js";

let passed = 0;
let failed = 0;

function assert(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.stack ?? err.message}`);
  }
}

function eq(actual: unknown, expected: unknown, label = "") {
  if (actual !== expected) {
    throw new Error(`${label ? label + ": " : ""}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

console.log("extractIntakes — AgentCIS's real product shape");

assert("every ticked month becomes its own intake", () => {
  const intakes = extractIntakes({
    id: 91234,
    name: "Advanced Diploma of Business",
    duration: "78 Weeks",
    intake_month: [
      { id: 0, value: "January" },
      { id: 3, value: "April" },
      { id: 6, value: "July" },
      { id: 9, value: "October" },
    ],
  });
  eq(intakes.length, 4, "count");
  eq(intakes.map((i) => i.intake_name).join(","), "January,April,July,October", "names");
  eq(intakes.map((i) => i.intake_month).join(","), "1,4,7,10", "months");
});

assert("the entry's zero-based id is never read as the month", () => {
  // { id: 1, value: "February" } — reading `id` would file this as January.
  const [feb] = extractIntakes({ name: "Diploma of Nursing", intake_month: [{ id: 1, value: "February" }] });
  eq(feb.intake_month, 2, "intake_month");
  eq(feb.intake_name, "February", "intake_name");
});

assert("no month ticked writes no intake", () => {
  // The 92% case, and the one that produced one intake per course.
  eq(extractIntakes({ id: 212775, name: "IELTS/PTE Foundation Course", intake_month: [] }).length, 0);
});

assert("the course name can never become an intake name", () => {
  for (const product of [
    { name: "Certificate IV in Kitchen Management", intake_month: [] },
    { name: "Bachelor of Laws", duration: "3 Years", description: "…" },
    { name: "Doctor of Philosophy", intake_month: [{ id: 1, value: "February" }] },
    // No product carries start_date today. If one ever does, the scalar fallback must map the
    // intake KEYS, not the product — passing the product itself is what named 103 Victoria
    // University intakes after their own courses.
    { name: "Master of Business", start_date: "2027-02-15" },
  ]) {
    for (const intake of extractIntakes(product)) {
      if (intake.intake_name === product.name) throw new Error(`leaked course name: ${product.name}`);
    }
  }
});

assert("a product stating nothing about intakes yields nothing", () => {
  eq(extractIntakes({ id: 7, name: "Bachelor of Arts", duration: "3 Years" }).length, 0);
});

assert("a month with no year keeps the month and invents no date", () => {
  const [feb] = extractIntakes({ name: "Bachelor of Arts", intake_month: [{ id: 1, value: "February" }] });
  eq(feb.intake_month, 2, "intake_month");
  eq(feb.intake_year, null, "intake_year");
  eq(feb.start_date, null, "start_date");
});

assert("a start_date on the product keeps its own date, not the course name", () => {
  const [only] = extractIntakes({ name: "Master of Business", start_date: "2027-02-15" });
  eq(only.start_date, "2027-02-15", "start_date");
  eq(only.intake_name, null, "intake_name");
});

console.log("\nextractIntakes — other shapes the mapper still accepts");

assert("a dated intakes array keeps its label and dates", () => {
  const [sem] = extractIntakes({
    name: "Bachelor of Laws",
    intakes: [{ name: "Semester 1 2027", start_date: "2027-02-15", application_deadline: "2026-11-30" }],
  });
  eq(sem.intake_name, "Semester 1 2027", "intake_name");
  // A term label names no month, and this mapper does not read one off the start date — that is
  // `deriveIntakeMonthYear`'s job inside `upsertIntake`, shared with both crawl workers, so the
  // stored row still ends up with intake_month = 2. Asserted null here on purpose: duplicating the
  // derivation in this mapper is exactly the drift CLAUDE.md (e)/(h) exist to prevent.
  eq(sem.intake_month, null, "intake_month");
  eq(sem.intake_year, 2027, "intake_year");
  eq(sem.start_date, "2027-02-15", "start_date");
  eq(sem.admission_deadline, "2026-11-30", "admission_deadline");
});

assert("an empty richer key falls through to intake_month", () => {
  const [jan] = extractIntakes({ name: "Geotechnical Engineering MSc", intakes: [], intake_month: [{ id: 0, value: "January" }] });
  eq(jan.intake_month, 1, "intake_month");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
