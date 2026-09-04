/**
 * Pure-ordering checks for the geo-aware featured-country order.
 * Run: node tests/destination-order.ts   (Node strips the types; no test framework needed)
 */

import assert from "node:assert/strict";
import { rankFor } from "../src/app/(web)/data/destination-order.ts";
import type { Destination } from "../src/app/(web)/data/destinations.ts";

const dest = (code: string | null): Destination => ({
  id: code ?? "x", name: code ?? "x", slug: (code ?? "x").toLowerCase(), flagEmoji: "🌐",
  heroImageUrl: null, code, institutionsLabel: null, tuitionMin: null, tuitionMax: null,
  tuitionCurrency: null, livingCostLabel: null,
});

const order = (home: string, codes: (string | null)[]) => {
  const rank = rankFor(home);
  return codes.map(dest).sort((a, b) => rank(a) - rank(b)).map((d) => d.code);
};

// Alphabetical from the API becomes home-country-first, then that origin's popular destinations.
assert.deepEqual(order("US", ["AU", "CA", "GB", "IT", "US"]), ["US", "GB", "IT", "AU", "CA"]);
assert.deepEqual(order("NP", ["AU", "CA", "GB", "NP", "US"]), ["NP", "AU", "US", "CA", "GB"]);
assert.deepEqual(order("IN", ["AU", "CA", "GB", "IN", "US"]), ["IN", "US", "CA", "GB", "AU"]);

// Codes come back lowercase from some rows; the visitor's own country still wins.
assert.deepEqual(order("GB", ["au", "gb", "us"]), ["gb", "us", "au"]);

// An origin we have no popular list for keeps the admin's order untouched.
assert.deepEqual(order("ZZ", ["AU", "CA", "GB", "US"]), ["AU", "CA", "GB", "US"]);

// The visitor's own country still sorts first without a popular list, and null codes sink last.
assert.deepEqual(order("ZZ", ["AU", null, "ZZ", "US"]), ["ZZ", "AU", "US", null]);

// Ties keep API order: same rank for both unlisted, so CA stays ahead of the later-listed KE.
assert.deepEqual(order("US", ["CA", "KE", "GB"]), ["GB", "CA", "KE"]);

console.log("destination-order: ok");
