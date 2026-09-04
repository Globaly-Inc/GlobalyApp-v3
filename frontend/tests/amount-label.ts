/**
 * Pure checks for `amountLabel` — the one formatter behind every public price. It replaced the
 * <Money> component and its FX table, so these pin what a price looks like now: the figure in the
 * currency the row stored, never converted.
 * Run: node tests/amount-label.ts   (Node strips the types; no test framework needed)
 */

import assert from "node:assert/strict";
import { amountLabel } from "../src/lib/utils.ts";

// A figure in the currency it was quoted in.
assert.equal(amountLabel("47388", "AUD"), "AUD 47,388");
assert.equal(amountLabel(96000, "aud"), "AUD 96,000");

// A range states the code once, on the low end.
assert.equal(amountLabel(800, "AUD", 1500), "AUD 800 – 1,500");

// Scraped currency columns are messy; the code is pulled out of whatever is there.
assert.equal(amountLabel(800, "AUD$ 1,000"), "AUD 800");

// No currency on the row: a bare figure, never stamped with a code it was not quoted in.
assert.equal(amountLabel(500, null), "500");

// Fees arrive as numeric strings, and an empty column is not zero — "AUD 0" would read as free.
assert.equal(amountLabel("", "AUD"), null);
assert.equal(amountLabel(null, "AUD"), null);
assert.equal(amountLabel("n/a", "AUD"), null);
assert.equal(amountLabel(800, "AUD", ""), "AUD 800");

// Cents never reach a tuition figure.
assert.equal(amountLabel(28400.6, "USD"), "USD 28,401");

console.log("amount-label: all assertions passed");
