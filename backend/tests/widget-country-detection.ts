/**
 * detectCountryCode() — which country a turn scopes the Knowledge Rack to.
 * Run: npm run test:widget-country-detection
 *
 * Needs the DB (the countries table), read-only, no fixtures: these are the platform's own
 * reference rows. The case that matters is a reply answering a two-country question — matching is
 * first-hit over an UNORDERED list, so reading the question before the reply resolves "Canada"
 * answering "Australia or Canada?" to whichever row the table lists first.
 */
import assert from "node:assert/strict";
import { masterKnex } from "../src/core/db/master-pool.js";
import { detectCountryCode } from "../src/modules/ai-counsellor/services/rag.service.js";

const CHOICE = "Would you like to study in Australia or Canada?";

// The student picked Canada. Their own words win, whatever order the table is in.
assert.equal(await detectCountryCode("Canada", CHOICE), "CA");
assert.equal(await detectCountryCode("Australia", CHOICE), "AU");
// A reply naming no country falls back to the question it answers — the whole point of passing one.
assert.equal(await detectCountryCode("yes", "Do you want to see courses in Canada?"), "CA");
assert.equal(await detectCountryCode("the second one", "Our Canada campuses?"), "CA");
// No fallback, nothing to detect.
assert.equal(await detectCountryCode("yes"), null);
assert.equal(await detectCountryCode("tell me about nursing"), null);
// A question with its own country ignores the fallback entirely.
assert.equal(await detectCountryCode("what about Canada?", "Any interest in Australia?"), "CA");
// Aliases still work on both sides.
assert.equal(await detectCountryCode("the UK please"), "GB");
assert.equal(await detectCountryCode("yes", "Shall I cover the USA?"), "US");

console.log("widget-country-detection: ok");
await masterKnex.destroy();
