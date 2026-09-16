/**
 * LLM usage accounting + result cache (design doc 2026-09-15 §3.1–3.2).
 *
 * What silently breaks the feature:
 *   1. the cache key — model must be in it, any byte of input must move it
 *   2. what gets cached — a repaired or truncated answer must NOT be
 *   3. the hit path — identical input twice = ONE model call, a zero-token usage row, a bump
 *   4. attribution — usage rows carry the ambient job and kind; withLlmKind overrides kind only
 *   5. pricing — an unpriced model yields null, never a partial dollar total
 *
 * Run: node --import tsx tests/llm-usage-cache.ts   (or: npm run test:llm-usage-cache)
 *
 * No Gemini, no database: both are swapped through _llmDeps. Pure logic under test.
 */

import "dotenv/config";
import {
  _llmDeps, extractJson, inputHash, shouldCache, setLlmContext, withLlmKind, recordUsage,
} from "../src/modules/superadmin/data-extraction/lib/llm-client.js";
import { costUsd, totalCostUsd, _resetPricesForTests } from "../src/modules/superadmin/data-extraction/lib/llm-pricing.js";

let passed = 0;
let failed = 0;
function assert(condition: boolean, label: string, detail?: unknown) {
  if (condition) { passed++; console.log(`  ok   ${label}`); }
  else { failed++; console.error(`  FAIL ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`); }
}

// ── In-memory stand-ins for Gemini and the two tables ──
const cache = new Map<string, unknown>();
const usage: Array<Record<string, unknown>> = [];
const bumps: string[] = [];
let generateCalls = 0;
let nextAnswer = { text: '{"courses":[{"name":"MSc Entomology"}]}', truncated: false };

_llmDeps.generate = async () => {
  generateCalls++;
  return { text: nextAnswer.text, truncated: nextAnswer.truncated, usage: { promptTokenCount: 1000, candidatesTokenCount: 50 } };
};
_llmDeps.store = {
  insertUsage: async (row) => { usage.push({ ...row }); },
  findCached: async (hash) => cache.get(hash),
  saveCached: async (row) => { if (!cache.has(row.input_hash)) cache.set(row.input_hash, row.result); },
  bumpCacheHit: async (hash) => { bumps.push(hash); },
};
const settle = () => new Promise((r) => setTimeout(r, 0)); // let fire-and-forget writes land

console.log("\n1. the cache key");
{
  const a = inputHash("m1", "sys", "prompt");
  assert(a === inputHash("m1", "sys", "prompt"), "same input, same key");
  assert(a !== inputHash("m2", "sys", "prompt"), "a different model is a different key");
  assert(a !== inputHash("m1", "sys", "prompt "), "one extra byte of prompt moves the key");
  assert(a !== inputHash("m1", "sys2", "prompt"), "the system prompt is in the key");
  // The separator matters: without it "ab"+"c" and "a"+"bc" would collide.
  assert(inputHash("m", "ab", "c") !== inputHash("m", "a", "bc"), "field boundaries are part of the key");
}

console.log("\n2. what gets cached");
{
  assert(shouldCache({ ok: 1 }, false, "direct"), "a clean complete answer is cached");
  assert(!shouldCache({ ok: 1 }, true, "direct"), "a MAX_TOKENS-truncated answer is not");
  assert(!shouldCache({ ok: 1 }, false, "repaired"), "a repaired-JSON answer is not");
  assert(!shouldCache(null, false, "direct"), "an unparseable answer is not");
}

console.log("\n3. the hit path");
{
  setLlmContext({ jobId: "job-A", kind: "course_extraction" });
  const opts = { system: "S", prompt: "P", model: "gemini-test" };

  const first = await extractJson<{ courses: unknown[] }>(opts);
  await settle();
  assert(generateCalls === 1 && first.courses.length === 1, "first call reaches the model");
  assert(cache.size === 1, "and its answer is stored", cache.size);

  const second = await extractJson<{ courses: unknown[] }>(opts);
  await settle();
  assert(generateCalls === 1, "identical input a second time does NOT reach the model", generateCalls);
  assert(JSON.stringify(second) === JSON.stringify(first), "and returns the same answer");
  assert(bumps.length === 1, "the hit is counted on the cache row");

  const hitRow = usage[usage.length - 1];
  assert(hitRow.cache_hit === true && hitRow.prompt_tokens === 0 && hitRow.output_tokens === 0,
    "the hit is a zero-token usage row", hitRow);
  const missRow = usage[0];
  assert(missRow.cache_hit === false && missRow.prompt_tokens === 1000 && missRow.output_tokens === 50,
    "the miss recorded what Gemini billed", missRow);

  await extractJson(opts, ).catch(() => {}); // still cached
  await extractJson({ ...opts, prompt: "P2" });
  await settle();
  assert(generateCalls === 2, "a different prompt is a miss", generateCalls);

  await extractJson({ ...opts, noCache: true });
  await settle();
  assert(generateCalls === 3, "noCache bypasses the lookup", generateCalls);
  assert(cache.size === 2, "and does not store", cache.size);

  nextAnswer = { text: '{"courses":[', truncated: true };
  await extractJson({ ...opts, prompt: "P3" }).catch(() => {});
  await settle();
  assert(cache.size === 2, "a truncated answer is never stored", cache.size);
  nextAnswer = { text: '{"courses":[]}', truncated: false };
}

console.log("\n4. attribution");
{
  usage.length = 0;
  setLlmContext({ jobId: "job-B", kind: "verify" });
  recordUsage("m", { promptTokenCount: 1, candidatesTokenCount: 1 });
  await withLlmKind("secondary", async () => { recordUsage("m", { promptTokenCount: 2, candidatesTokenCount: 2 }); });
  recordUsage("m", { promptTokenCount: 3, candidatesTokenCount: 3 }, { kind: "pdf_vision" });
  await settle();
  assert(usage[0].job_id === "job-B" && usage[0].kind === "verify", "a call inherits the ambient job and kind", usage[0]);
  assert(usage[1].job_id === "job-B" && usage[1].kind === "secondary", "withLlmKind overrides kind and keeps the job", usage[1]);
  assert(usage[2].kind === "pdf_vision", "an explicit kind wins", usage[2]);
  assert(usage[3] === undefined && usage[2].job_id === "job-B", "after withLlmKind returns, the ambient kind is restored (next row would be 'verify')");
}

console.log("\n5. pricing");
{
  process.env.LLM_MODEL_PRICES = JSON.stringify({ "priced-model": { input: 1, output: 10 } });
  _resetPricesForTests();
  assert(costUsd("priced-model", 1_000_000, 100_000) === 2, "1M in @ $1 + 100k out @ $10 = $2");
  assert(costUsd("unpriced-model", 1_000_000, 0) === null, "an unpriced model is null, not zero");
  assert(
    totalCostUsd([{ model: "priced-model", prompt_tokens: 1_000_000, output_tokens: 0 }, { model: "unpriced-model", prompt_tokens: 5, output_tokens: 5 }]) === null,
    "one unpriced model makes the TOTAL null — no partial sums presented as totals",
  );
  assert(totalCostUsd([]) === null, "no calls, no cost");
  process.env.LLM_MODEL_PRICES = "not json";
  _resetPricesForTests();
  assert(costUsd("priced-model", 1, 1) === null, "bad JSON degrades to tokens-only, never throws");
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
