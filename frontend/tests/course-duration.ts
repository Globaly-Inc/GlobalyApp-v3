/**
 * Pure checks for `courseDuration` — the one formatter behind both the course-list badge and the
 * detail panel's duration dropdown label.
 *
 * The property that matters is REVERSIBILITY. An earlier version rendered years with toFixed(1),
 * so 53 and 54 weeks both read "1.0 years" and a reviewer could not tell two stored values apart —
 * on a picker, that invites a "correction" that overwrites a different real duration. Only exact
 * whole and half years take the year form now; everything else stays in the unit the column holds.
 * Run: node --experimental-strip-types tests/course-duration.ts   (no test framework needed)
 */

import assert from "node:assert/strict";
import { courseDuration } from "../src/app/admin/data/all-extractions/utils/index.ts";

// Nothing stored reads as nothing, never as "0 weeks".
assert.equal(courseDuration(null), null);
assert.equal(courseDuration(undefined), null);
assert.equal(courseDuration(0), null);
assert.equal(courseDuration(-4), null);

// Under a year, weeks are what the source stated and what the column holds.
assert.equal(courseDuration(1), "1 week");
assert.equal(courseDuration(8), "8 weeks");
assert.equal(courseDuration(26), "26 weeks"); // NOT "0.5 years" — a half year needs a year to halve
assert.equal(courseDuration(39), "39 weeks");

// Exact whole and half years are how a degree is actually advertised.
assert.equal(courseDuration(52), "1 year");
assert.equal(courseDuration(78), "1.5 years");
assert.equal(courseDuration(104), "2 years");
assert.equal(courseDuration(130), "2.5 years");
assert.equal(courseDuration(208), "4 years");

// The regression: an inexact year count stays in weeks rather than rounding to a shared label.
assert.equal(courseDuration(53), "53 weeks");
assert.equal(courseDuration(54), "54 weeks");
assert.equal(courseDuration(60), "60 weeks");

// The property itself, exhaustively: no two week counts may render the same label.
const seen = new Map<string, number>();
for (let weeks = 1; weeks <= 1040; weeks++) {
  const label = courseDuration(weeks)!;
  const clash = seen.get(label);
  assert.equal(clash, undefined, `${clash}w and ${weeks}w both render "${label}"`);
  seen.set(label, weeks);
}

console.log("course-duration: all assertions passed");
