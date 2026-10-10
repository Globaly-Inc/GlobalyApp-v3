/**
 * The widget compares options in the reply itself, not in a comparison block — a table is a
 * horizontally-scrolling card in a 380px panel. The dashboard, which has the width for it, keeps
 * the block. Both halves live in buildSystemPrompt, so pin both.
 *
 * Run: npm run test:widget-comparison-prose    Pure function, no DB, no network.
 */
import assert from "node:assert/strict";
import { buildSystemPrompt } from "../src/modules/ai-counsellor/services/prompt.service.js";

const base = { profile: null, ragContext: "", isFirstMessage: false, toolMode: true } as const;
const widget = buildSystemPrompt({ ...base, embedConfig: { display_name: "AIT", custom_instructions: null } });
const dashboard = buildSystemPrompt({ ...base });

// The widget is never offered the block, so there is nothing for it to emit.
assert.ok(!widget.includes('"type":"comparison"'), "widget prompt still offers the comparison block");
// ...and is told what to do instead, or it reaches for a markdown table — the same grid one layer down.
assert.match(widget, /compare them IN THE REPLY/);
assert.match(widget, /Never a table, in a block or in markdown/);

// The dashboard keeps it: full-width chat, the table reads fine there.
assert.ok(dashboard.includes('"type":"comparison"'), "dashboard prompt lost the comparison block");
assert.ok(!dashboard.includes("compare them IN THE REPLY"), "widget-only rule leaked into the dashboard prompt");

// Every other block type is untouched on both surfaces.
for (const type of ["breakdown", "timeline", "recommendation", "quick_replies", "image"]) {
  assert.ok(widget.includes(`"type":"${type}"`), `widget lost the ${type} block`);
  assert.ok(dashboard.includes(`"type":"${type}"`), `dashboard lost the ${type} block`);
}

console.log("widget-comparison-prose: ok");
