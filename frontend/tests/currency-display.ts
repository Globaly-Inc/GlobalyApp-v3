/**
 * Pure checks for the money formatting behind <Money>. Every figure is shown in the currency the
 * row stored — there is no conversion, so these pin the formatting and the "amount as stored" rule.
 * Run: node tests/currency-display.ts   (Node strips the types; no test framework needed)
 */

import assert from "node:assert/strict";
import { displayMoney, normalizeCurrency, toAmount } from "../src/app/(web)/data/currency-rates.ts";

const text = (low: number | null, high: number | null, from: string) =>
  displayMoney(low, high, from)?.text.replace(/ /g, " ") ?? null;

// Shown exactly as quoted, whichever currency that is.
assert.equal(text(24500, null, "USD"), "USD 24,500");
assert.equal(text(38000, null, "AUD"), "AUD 38,000");
assert.equal(text(5000, null, "THB"), "THB 5,000");

// A range states the code once, on the low end.
assert.equal(text(300, 700, "USD"), "USD 300 – 700");
assert.equal(text(1520, 3040, "AUD"), "AUD 1,520 – 3,040");

// No currency on the row at all: a bare number, never stamped with a code.
assert.equal(text(500, null, ""), "500");

// Nothing to show.
assert.equal(displayMoney(null, null, "USD"), null);

// Column values arrive as strings, and empty is not zero.
assert.equal(toAmount("1234.5"), 1234.5);
assert.equal(toAmount(""), null);
assert.equal(toAmount(null), null);
assert.equal(toAmount("n/a"), null);

// Scraped currency columns are messy.
assert.equal(normalizeCurrency("aud"), "AUD");
assert.equal(normalizeCurrency("AUD$ 1,000"), "AUD");
assert.equal(normalizeCurrency(null), "");

console.log("currency-display: all assertions passed");
