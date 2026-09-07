/**
 * Find Missing Details test — covers pickMissingFields, the pure logic behind
 * findMissingOverviewFields (institution-lookup.service.ts) that decides which
 * extraction_institution_overview columns are worth looking up.
 * Run: node --import tsx tests/institution-lookup-missing-fields.ts
 *
 * Style matches tests/visa-service-extraction.ts: plain tsx script, manual counters, no framework.
 */

import "dotenv/config";

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
  const { pickMissingFields } = await import("../src/modules/superadmin/data-extraction/services/institution-lookup.service.js");

  // 1. No overview row yet → every candidate field is missing.
  assert(pickMissingFields(undefined).includes("phone"), "no overview: phone is missing");
  assert(pickMissingFields(null).includes("email"), "no overview: email is missing");

  // 2. Populated fields are excluded; null/empty-string fields are included.
  const partial = pickMissingFields({ phone: "+1 555 0100", email: null, address: "", city: "Boston" });
  assert(!partial.includes("phone"), "populated phone is excluded");
  assert(partial.includes("email"), "null email is included");
  assert(partial.includes("address"), "empty-string address is included");
  assert(!partial.includes("city"), "populated city is excluded");

  // 3. Whitespace-only string counts as empty.
  assert(pickMissingFields({ state: "   " }).includes("state"), "whitespace-only state is included");

  // 4. A fully-populated overview has nothing left to look up.
  const full = {
    phone: "x", email: "x", address: "x", city: "x", state: "x",
    zip_code: "x", country: "x", description: "x", logo_url: "x",
  };
  assert(pickMissingFields(full).length === 0, "fully populated overview has no missing fields");

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
