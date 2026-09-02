/**
 * Pure checks for the money formatting behind <Money> and the navbar currency picker.
 * Run: node tests/currency-display.ts   (Node strips the types; no test framework needed)
 */

import assert from "node:assert/strict";
import { convert, displayMoney, normalizeCurrency, toAmount } from "../src/app/(web)/data/currency-rates.ts";

const text = (low: number | null, high: number | null, from: string, to: string) =>
  displayMoney(low, high, from, to)?.text.replace(/ /g, " ") ?? null;

// Same currency: shown exactly as quoted.
assert.equal(text(24500, null, "USD", "USD"), "USD 24,500");

// Cross-currency: converted, with the original offered as the tooltip.
assert.equal(text(38000, null, "AUD", "USD"), "USD 25,000");
assert.match(displayMoney(38000, null, "AUD", "USD")!.title!, /AUD.38,000 converted at an indicative rate/);

// A range states the code once, on the low end.
assert.equal(text(300, 700, "USD", "USD"), "USD 300 – 700");
assert.equal(text(1520, 3040, "AUD", "USD"), "USD 1,000 – 2,000");

// Round trip through USD is lossless enough to land back on the same figure.
assert.equal(Math.round(convert(convert(1000, "AUD", "JPY")!, "JPY", "AUD")!), 1000);

// A currency with no rate in the table can't be converted — the amount stays as quoted.
assert.equal(text(5000, null, "THB", "USD"), "THB 5,000");

// No currency on the row at all: a bare number, never stamped with the reader's code.
assert.equal(text(500, null, "", "USD"), "500");

// Nothing to show.
assert.equal(displayMoney(null, null, "USD", "USD"), null);

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
