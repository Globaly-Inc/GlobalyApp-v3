/**
 * Which turn is the stream question — the route's half of the two-step widget intake.
 *
 * Turn 2 asks which stream ONLY when the visitor answered the level question and has not already
 * named a subject we teach. Both guards matter: without the first, any second message triggers a
 * stream question; without the second, "a master's in engineering" gets asked what subject they
 * want, which is the interrogation the discovery turns exist to avoid.
 *
 * Run: npm run test:widget-stream-turn-gate    Pure functions, no DB, no network.
 */
import assert from "node:assert/strict";
import { isDiscoveryTurn, namesSubject, statedLevel } from "../src/modules/ai-counsellor/routes/guest.routes.js";

// ── Discovery belongs to widgets, not to the one-reply guest trial ──
// A plain guest is stateless: no session, so history.length is 0 on EVERY message, and the signup
// gate caps them at one reply. Discovery there spends that reply on a question they are never
// allowed to answer, and they see no course at all (Greptile P1).
assert.equal(isDiscoveryTurn(true, 0), true, "a widget's first turn is discovery");
assert.equal(isDiscoveryTurn(true, 2), false, "a widget's later turns are not");
assert.equal(isDiscoveryTurn(false, 0), false, "a plain guest's single trial reply keeps its courses");

// ── statedLevel: their own words, in any of the shapes a quick_replies value arrives as ──
for (const [said, expected] of [
  ["I am looking at master's programs", "Master's"],
  ["masters please", "Master's"],
  ["I am looking for a PhD", "PhD"],
  ["doctoral study", "PhD"],
  ["undergraduate", "Bachelor's"],
  ["I want short professional training", "Short course"],
  // A named qualification keeps its own name — it is what matches the catalogue's own levels.
  ["I am looking at a certificate", "Certificate"],
  ["do you have diplomas?", "Diploma"],
  // A level named inside a fuller sentence still counts — that is the answer, however phrased.
  ["I finished my bachelors, now I want a masters", "Master's"],
  // Not an answer to the level question at all: the turn goes back on the normal path.
  ["what are your fees?", null],
  ["tell me about Bangkok", null],
] as Array<[string, string | null]>) {
  assert.equal(statedLevel(said), expected, `statedLevel(${JSON.stringify(said)})`);
}

// ── namesSubject: has the stream question already been answered? ──
const CATALOGUE = [
  { degree_level: "Master's", subject_area: "Engineering", count: 12 },
  { degree_level: "Master's", subject_area: "Business and Management", count: 6 },
];
assert.equal(namesSubject("I am looking at master's programs", CATALOGUE), false, "a bare level names no subject");
assert.equal(namesSubject("a masters in engineering", CATALOGUE), true, "one distinctive word is enough");
assert.equal(namesSubject("business and management please", CATALOGUE), true, "the whole area matches");
// "and" must never be the word that matches, or every message names every area.
assert.equal(namesSubject("masters, and soon", CATALOGUE), false, "filler words do not match an area");
assert.equal(namesSubject("engineering", []), false, "no catalogue, nothing to match against");

console.log("widget-stream-turn-gate: ok");
