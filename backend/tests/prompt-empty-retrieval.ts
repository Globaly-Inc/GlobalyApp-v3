/**
 * Nothing retrieved must be SAID, not merely implied by an absent CONTEXT block.
 *
 * The symptom: a broad opening question ("tell me about data science") retrieved nothing, so no
 * CONTEXT section was pushed at all — and the model, holding the institution's name and a
 * counselling brief, answered from general knowledge and closed with "we offer several courses in
 * this area". It had never seen a catalogue. Silence is not an instruction: the model cannot infer
 * from a missing section that a search ran and came back empty.
 *
 * Run: npm run test:prompt-empty-retrieval    Pure function, no DB, no network.
 */
import assert from "node:assert/strict";
import { buildSystemPrompt } from "../src/modules/ai-counsellor/services/prompt.service.js";

const base = { profile: null, isFirstMessage: false } as const;
const widget = { display_name: "AIT", custom_instructions: null };

const empty = buildSystemPrompt({ ...base, ragContext: "", embedConfig: widget });
const full = buildSystemPrompt({ ...base, ragContext: "--- COURSES ---\nBSc Nursing", embedConfig: widget });

// The rule fires exactly when there is nothing to answer from.
assert.match(empty, /NO RECORDS RETRIEVED THIS TURN/, "empty retrieval says nothing about itself");
assert.ok(!full.includes("NO RECORDS RETRIEVED"), "a turn WITH context must not claim it has none");
assert.match(full, /CONTEXT:\n--- COURSES ---/, "context still renders");

// What the model must not do — the actual reported defect, in its own words.
assert.match(empty, /Do not state or imply what we do or do not offer/);
assert.match(empty, /we offer several courses/, "the failing phrasing is named, so the rule is unambiguous");
assert.match(empty, /we don't have that/, "the opposite over-claim is barred too");

// What it must still do: a broad question is normal, not an error to apologise for.
assert.match(empty, /General knowledge about a subject or a country is still fine/);
assert.match(empty, /ask the ONE thing that would let you search properly/);

// Tool mode retrieves for itself, and a discovery turn skipped retrieval deliberately — neither is
// the "I searched and found nothing" case this rule describes.
assert.ok(
  !buildSystemPrompt({ ...base, ragContext: "", toolMode: true, embedConfig: widget }).includes("NO RECORDS RETRIEVED"),
  "tool mode must not be told its empty prefix means an empty search",
);
assert.ok(
  !buildSystemPrompt({ ...base, ragContext: "", discoveryTurn: true }).includes("NO RECORDS RETRIEVED"),
  "a deliberate discovery turn keeps its own instruction",
);

console.log("prompt-empty-retrieval: ok");
