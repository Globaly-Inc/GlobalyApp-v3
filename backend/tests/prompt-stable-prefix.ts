/**
 * The counsellor's system prompt is ~3.7k tokens and is re-sent on every turn AND every tool
 * round — measured average input on this DB is 4,146 tokens against 196 out, so the prompt IS
 * the per-turn bill. Gemini's implicit context cache discounts it only while the prefix stays
 * byte-identical, which is why buildSystemPrompt keeps a `tail` for everything that changes
 * during a conversation.
 *
 * This test holds that split: vary ONLY the volatile inputs and the long static rules prefix
 * must not move. Pushing a per-turn section onto `sections` instead of `tail` fails here.
 *
 * Run: node --import tsx tests/prompt-stable-prefix.ts   (or: npm run test:prompt-stable-prefix)
 * Pure function, no DB, no network.
 */

import { buildSystemPrompt } from "../src/modules/ai-counsellor/services/prompt.service.js";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: unknown) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}`, detail ?? "");
  }
}

const base = {
  profile: null,
  ragContext: "",
  isFirstMessage: false,
  toolMode: true,
  embedConfig: { display_name: "Asian Institute of Technology", custom_instructions: null },
} as const;

/** Longest common prefix of two prompts — what Gemini can actually serve from cache. */
function commonPrefix(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && a[i] === b[i]) i++;
  return i;
}

const turn1 = buildSystemPrompt({ ...base });
const turn2 = buildSystemPrompt({
  ...base,
  // Everything a later turn in the SAME conversation changes.
  institutionGuidance: "INSTITUTION MEMORY:\n- Visitors from Nepal ask about hostel fees first.",
  counsellingContext: { goals: ["move into data science"], stage: "narrowing" } as never,
  withheldMoneyTopics: ["fees"],
  ragContext: "COURSES:\n- MSc Data Science — 2 years",
});

const shared = commonPrefix(turn1, turn2);

console.log(`\nturn 1: ${turn1.length} chars   turn 2: ${turn2.length} chars   shared prefix: ${shared}`);

assert(
  shared >= 11_000,
  "the static rules stay in the shared prefix when only volatile inputs change",
  `shared prefix is only ${shared} chars — a per-turn section is being pushed onto \`sections\``,
);
assert(
  turn1.slice(0, shared).includes("INTERACTIVE BLOCKS:"),
  "the block/card/chips formatting rules are inside the cached prefix",
);
assert(
  turn1.slice(0, shared).includes("COUNSELLING APPROACH:"),
  "the counselling rules are inside the cached prefix",
);
assert(
  !turn2.slice(0, shared).includes("CONTEXT:\n"),
  "this turn's retrieved CONTEXT is NOT in the shared prefix (it must be last)",
);

// The documented ordering constraint the tail must preserve: the institution memory block's
// hard-limits line is the last rule before the student's own data.
const guidanceAt = turn2.indexOf("INSTITUTION MEMORY:");
const contextAt = turn2.indexOf("CONTEXT:\n");
assert(guidanceAt > -1 && contextAt > guidanceAt, "institution memory still precedes the student data");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
