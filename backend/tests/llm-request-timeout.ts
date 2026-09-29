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
import { isTransient, withRetry } from "../src/modules/superadmin/data-extraction/lib/llm-client.js";

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

// ── The retry budget must expire before the reclaim sweep steals the page ───
// MAX_RETRIES=3 is four attempts; at a 5-minute per-request timeout that is 20 minutes, exactly
// extraction-queue-reclaim.worker.ts's STALE_MINUTES. The sweep would then reclaim a page whose
// attempt is still running: duplicate model spend, and the original's answer thrown away by the
// page worker's stillOwned() fence. withRetry must stop on the CLOCK, not the attempt count.
{
  const RECLAIM_MS = 20 * 60_000; // STALE_MINUTES in extraction-queue-reclaim.worker.ts
  const realNow = Date.now, realTimeout = global.setTimeout;
  let clock = 0;
  Date.now = () => clock;
  (global as { setTimeout: unknown }).setTimeout = ((fn: () => void, ms = 0) => { clock += ms; fn(); return 0 as never; });

  const runSlow = async () => {
    let attempts = 0;
    try {
      await withRetry(async () => {
        attempts++;
        clock += 300_000; // each attempt burns its full 5-minute request timeout
        throw new Error("Request aborted when fetching generativelanguage.googleapis.com: timeout");
      });
      return { attempts, elapsed: clock, threw: "" };
    } catch (err) { return { attempts, elapsed: clock, threw: String((err as Error).message) }; }
  };
  const slow = await runSlow();

  // A FAST transient (429) costs no wall clock, so all four attempts must still be spent.
  clock = 0;
  let fast = 0;
  await withRetry(async () => { fast++; throw new Error("429 Too Many Requests"); }).catch(() => {});

  Date.now = realNow;
  (global as { setTimeout: unknown }).setTimeout = realTimeout;

  eq(/AI_TRANSIENT/.test(slow.threw), true, `exhausted budget surfaces as AI_TRANSIENT (${slow.threw.slice(0, 60)})`);
  eq(slow.elapsed < RECLAIM_MS, true, `total wait ${Math.round(slow.elapsed / 60_000)} min stays under the ${RECLAIM_MS / 60_000}-min reclaim threshold`);
  eq(slow.attempts < 4, true, `slow failures stop early (${slow.attempts} attempts), not all 4`);
  eq(fast, 4, `a fast 429 still gets every attempt (${fast})`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
