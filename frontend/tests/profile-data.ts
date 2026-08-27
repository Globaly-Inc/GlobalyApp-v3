/**
 * Pure-mapper checks for the shared public-profile data shape.
 * Run: node tests/profile-data.ts   (Node strips the types; no test framework needed)
 */

import assert from "node:assert/strict";
import { joinParts, toNumber, toProfileRegistration, toProfileSocials } from "../src/app/(web)/components/profile/profile-data.ts";

assert.equal(joinParts("Sydney", null, "Australia"), "Sydney, Australia");
assert.equal(joinParts(null, undefined, ""), null);

// Postgres hands back `decimal` columns as strings — the map needs real numbers.
assert.equal(toNumber("-33.8688"), -33.8688);
assert.equal(toNumber(""), null);
assert.equal(toNumber(null), null);
assert.equal(toNumber("not-a-number"), null);

// The JSON block wins over the plain column, and every extra licence gets its own row.
assert.deepEqual(
  toProfileRegistration("FALLBACK-1", {
    business_registration: { type: "ABN", number: "12 345 678 901" },
    licenses: [{ type: "CRICOS", number: "00586B" }, { number: "NO-TYPE" }],
  }),
  [
    { label: "ABN", value: "12 345 678 901" },
    { label: "CRICOS", value: "00586B" },
    { label: "Licence", value: "NO-TYPE" },
  ],
);
assert.deepEqual(toProfileRegistration("FALLBACK-1", null), [{ label: "Registration", value: "FALLBACK-1" }]);
assert.deepEqual(toProfileRegistration(null, null), []);

assert.deepEqual(
  toProfileSocials({ facebook_url: "fb.com/x", twitter_url: null, linkedin_url: "https://li.com/x" }),
  [{ name: "facebook", url: "fb.com/x" }, { name: "linkedin", url: "https://li.com/x" }],
);

console.log("✓ profile-data mappers");
