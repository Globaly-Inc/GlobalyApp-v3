/**
 * The shared model-JSON parser. Guards the drift that broke the JHU catalogue pages: the
 * OpenRouter fallback used a bare JSON.parse while the Gemini path repaired the same output.
 * Run: node --import tsx tests/model-json.ts
 */
import { parseModelJson } from "../src/shared/ai/parse-model-json.js";

let passed = 0, failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) passed++;
  else { failed++; console.error(`FAIL: ${label} — expected ${e}, got ${a}`); }
}

eq(parseModelJson('{"a":1}').value, { a: 1 }, "clean JSON");
eq(parseModelJson('{"a":1}').via, "direct", "…reported as direct");
eq(parseModelJson('```json\n{"a":1}\n```').value, { a: 1 }, "markdown fences");
eq(parseModelJson('{"a":1}}').value, { a: 1 }, "trailing junk after the balanced end");

// The real failure: a listing page cut off mid-value by the output-token limit.
eq(parseModelJson('{"courses":[{"name":"A"},{"name":"B"},{"name":"C').value,
   { courses: [{ name: "A" }, { name: "B" }] }, "truncated mid-object keeps the complete entries");
eq(parseModelJson('{"courses":[{"name":"A"},{"name":"Unterminated stri').value,
   { courses: [{ name: "A" }] }, "truncated mid-string keeps the complete entries");
eq(parseModelJson('{"courses":[{"name":"A"},{"name":"B"},{"name":"C').via, "salvaged", "…reported as salvaged");

eq(parseModelJson("not json at all").value, null, "unparseable returns null, never throws");
eq(parseModelJson("").value, null, "empty returns null");
eq(parseModelJson("").via, "failed", "…reported as failed");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
