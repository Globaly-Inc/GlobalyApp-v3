/**
 * A Gemini request that times out must be classified TRANSIENT.
 * Pure, no network. Run: npm run test:llm-request-timeout
 *
 * Exists because @google/generative-ai 0.24.1 defaults to NO request timeout. A hung connection
 * left the step worker's consume callback pending forever: never acked, never nacked, no throw,
 * no log line, no job event — the Analyse chip sat on "Running" permanently, the UI's Run button
 * stayed disabled (`disabled={... || running}`), and checkAllPagesDone's inFlightStep guard
 * blocked that job from ever completing. geminiGenerate now passes { timeout }, which makes the
 * SDK throw GoogleGenerativeAIAbortError — worthless unless isTransient recognises it, because an
 * unrecognised error is rethrown raw on the FIRST attempt with no retry.
 */
import { isTransient } from "../src/modules/superadmin/data-extraction/lib/llm-client.js";

let passed = 0, failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) passed++;
  else { failed++; console.error(`FAIL ${label}: expected ${expected}, got ${actual}`); }
}

// The literal strings @google/generative-ai 0.24.1 builds on abort (dist/index.js:409-410, 759-760).
for (const msg of [
  "Request aborted when fetching https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent: The operation was aborted due to timeout",
  "Request aborted when reading from the stream",
]) eq(isTransient(new Error(msg)), true, `abort is transient: ${msg.slice(0, 40)}…`);

// Still transient — the pre-existing cases must not regress.
for (const msg of ["429 Too Many Requests", "503 Service Unavailable", "fetch failed", "ECONNRESET"])
  eq(isTransient(new Error(msg)), true, `still transient: ${msg}`);

// Still NOT transient — a bad prompt or a suspended account must fail fast, not retry 3x.
for (const msg of [
  "403 Forbidden: Lightning dunning decision is deny for project: projects/691364868355",
  "LLM returned invalid JSON",
  "400 Bad Request: contents is required",
]) eq(isTransient(new Error(msg)), false, `not transient: ${msg.slice(0, 40)}…`);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
