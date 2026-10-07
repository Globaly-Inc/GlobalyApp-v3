/**
 * Self-check for the AI feature's pure helpers — the thinking-stream label table,
 * which maps the backend's raw trace strings to what the student sees.
 *
 * Every input below is a string the backend actually emits (rag.service.ts,
 * chat.service.ts, tools.ts). A trace rename there shows up here as a red
 * assertion instead of a silent "Working on it" in the widget.
 *
 * Run from `frontend/`:
 *   node --import ../backend/node_modules/tsx/dist/loader.mjs src/app/ai/utils/self-check.ts
 */

import assert from "node:assert/strict";
import { thinkingPhase } from "./index.ts";

const cases: Array<[string | undefined, string]> = [
  [undefined, "Getting started"],
  ["Keywords: nursing, canada", 'Looking up "nursing canada" in our records'],
  ["Keywords (from the question it answers): nursing, melbourne, yes", 'Looking up "nursing melbourne yes" in our records'],
  ["Nothing to search this turn", "Reading your question"],
  ["Nothing to search; answering from the courses already shown", "Re-reading the courses we just showed you"],
  ["Institution memory: 2 rules, 3 relevant", "Checking our counselling notes"],
  ["Institution memory: 1 rules, 0 relevant (no question to match)", "Checking our counselling notes"],
  ["Country detected: CA", "Narrowing down by country"],
  ["Courses: skipped (discovery turn)", "Getting a feel for what you're after"],
  ["Courses: 0 found", "No course match yet — checking everything else"],
  ["Courses: 1 found", "Matched 1 course in our catalogue"],
  ["Courses: 8 found", "Matched 8 courses in our catalogue"],
  ["Course search failed", "Course lookup didn't answer — using what else we have"],
  ["Visas: 3 found", "Checking visa rules"],
  ["Visa knowledge: 2 found", "Checking visa rules"],
  ["Institutions: 5 found", "Checking institution records"],
  ["Own profile: found, 3 campuses", "Checking our own details"],
  ["Agents: 4 found", "Checking registered agents"],
  ["MARA agents: 1 found", "Checking registered agents"],
  ["FAQs: 5 found", "Checking our FAQs"],
  ["Country guides: 2 found", "Reading country guides"],
  ["This website: 6 passages found", "Reading 6 passages from our website"],
  ["Knowledge rack: 4 chunks found", "Reading 4 passages from our knowledge base"],
  ["Hydrating 3 courses", "Pulling fees and study options for 3 courses"],
  ["Hydrated: 3 courses", "Fees and study options ready"],
  ["Context: 6149 chars, 1 sources", "Analysing 1 source and preparing your answer"],
  ["Context: 6149 chars, 10 sources, money evidence: fees", "Analysing 10 sources and preparing your answer"],
  ["Money question, no evidence for fees: that part withheld", "Double-checking what we can confirm on costs"],
  ["Retrying without tools", "Taking another run at it"],
  ["Visa search failed", "One lookup didn't answer — using the rest"],
  // Tool-loop steps keep their own verb phrase, minus the query and counts.
  ["Searching courses…", "Searching courses"],
  ["Searched courses: nursing in Canada — 4 found (filters widened)", "Searched courses"],
  ["Read course detail: BSc Nursing", "Read course detail"],
  // Anything unrecognised still reads as work, never as a raw engineering string.
  ["Some step nobody mapped", "Working on it"],
];

for (const [input, expected] of cases) {
  assert.equal(thinkingPhase(input), expected, `thinkingPhase(${JSON.stringify(input)})`);
}

console.log(`thinking-phase labels: ${cases.length} cases OK`);
