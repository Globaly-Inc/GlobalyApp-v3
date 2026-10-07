/**
 * Contact details must be quoted, never composed. The never-invent rule in the identity sections
 * lists course/fee/visa/deadline claims only, so a phone number or email was never covered by it —
 * and a visitor who calls a number the model made up reaches a stranger, with nothing in the reply
 * saying it was never in our records.
 *
 * Run: npm run test:prompt-contact-grounding    Pure function, no DB, no network.
 */
import assert from "node:assert/strict";
import { buildSystemPrompt } from "../src/modules/ai-counsellor/services/prompt.service.js";

const base = { profile: null, ragContext: "", isFirstMessage: false, toolMode: true } as const;
const widget = buildSystemPrompt({ ...base, embedConfig: { display_name: "AIT", custom_instructions: null } });
const dashboard = buildSystemPrompt({ ...base });

// Both surfaces: a contact detail is only ever repeated from context, never constructed.
for (const [name, prompt] of [["widget", widget], ["dashboard", dashboard]] as const) {
  assert.match(prompt, /must appear VERBATIM in CONTEXT/, `${name} lost the verbatim rule`);
  assert.match(prompt, /never complete, correct, localise or guess one/, `${name} lost the no-guessing rule`);
  assert.match(prompt, /say we do not have it on file/, `${name} lost the fallback wording`);
}

// The widget's "when you lack information" fallback must not send the model hunting for a number
// it may not hold — that is the instruction that made inventing one look like following orders.
assert.ok(
  !widget.includes("point them to our published contact details instead"),
  "widget still points at contact details unconditionally",
);
assert.match(widget, /if\s+that section has none, say we do not have it on file/);
// The institution's OWN published details stay shareable — this is not a blanket gag.
assert.match(widget, /are that organisation's own and may be shared/);
// A person's details are still never quoted, on either surface.
for (const prompt of [widget, dashboard]) assert.match(prompt, /Never quote an individual's personal contact details/);

console.log("prompt-contact-grounding: ok");
