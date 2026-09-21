/**
 * The one-step-at-a-time gate (docs/data-extraction/2026-09-18-one-step-at-a-time-scraping-plan.md §5.1).
 *
 * What silently breaks the feature:
 *   1. auto mode must publish the next step — or the pipeline stalls after site_map forever
 *   2. manual mode must NOT publish — or "manual" is a label, not a gate
 *   3. stop_requested must NOT publish, whatever the mode
 *   4. a step with no successor publishes nothing and says so
 *   5. the classifier merge keeps a distrusted batch's heuristic URLs and pins guided URLs as course
 *
 * Run: node --import tsx tests/step-gate.ts   (or: npm run test:step-gate)
 * No queue, no database — swapped through _stepDeps.
 */

import "dotenv/config";
import { _stepDeps, advance, gate, mergeClassifierBatch, rolesFor } from "../src/modules/superadmin/data-extraction/lib/pipeline-steps.js";

let passed = 0;
let failed = 0;
function assert(condition: boolean, label: string, detail?: unknown) {
  if (condition) { passed++; console.log(`  ok   ${label}`); }
  else { failed++; console.error(`  FAIL ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`); }
}

// ── In-memory stand-ins ──
let job: { step_mode: "auto" | "manual"; stop_requested: boolean } | undefined = { step_mode: "auto", stop_requested: false };
const published: { queue: string; payload: Record<string, unknown> }[] = [];
const progress: Record<string, string> = {};
const events: string[] = [];

_stepDeps.loadJob = async () => job as never;
_stepDeps.publish = async (queue, payload) => { published.push({ queue, payload }); };
_stepDeps.setProgress = async (_jobId, patch) => { Object.assign(progress, patch); };
_stepDeps.writeEvent = async (_jobId, kind) => { events.push(kind); };

const reset = () => { published.length = 0; events.length = 0; for (const k of Object.keys(progress)) delete progress[k]; };

console.log("\n1. auto mode chains");
{
  reset();
  job = { step_mode: "auto", stop_requested: false };
  const r = await advance("job-1", "site_analysis");
  assert(r === "published", "advance reports published", r);
  assert(published.length === 1 && published[0].payload.step === "url_classify", "exactly one message, for the successor step", published);
  assert(progress.url_classify === "processing", "successor marked processing so the UI shows it running", progress);
}

console.log("\n2. manual mode waits");
{
  reset();
  job = { step_mode: "manual", stop_requested: false };
  const r = await advance("job-1", "site_analysis");
  assert(r === "waiting", "advance reports waiting", r);
  assert(published.length === 0, "nothing published", published);
  assert(progress.url_classify === "waiting", "successor marked waiting for the admin's Run button", progress);
  assert(events.includes("step_waiting"), "a step_waiting event tells the timeline why the job paused", events);
}

console.log("\n3. stop_requested waits even in auto");
{
  reset();
  job = { step_mode: "auto", stop_requested: true };
  const r = await advance("job-1", "url_classify");
  assert(r === "waiting" && published.length === 0, "stop request beats auto mode", { r, published });
}

console.log("\n4. no successor");
{
  reset();
  job = { step_mode: "auto", stop_requested: false };
  const r = await advance("job-1", "queue_pages");
  assert(r === "none" && published.length === 0, "queue_pages is the end of the chain — the page worker takes over", { r, published });
  const g = await gate("job-1", "site_map");
  assert(g === "site_snapshot", "gate() hands the caller the successor so it can publish batches itself", g);
}

console.log("\n5. classifier merge");
{
  const batch = ["https://x.edu/a", "https://x.edu/b", "https://x.edu/c", "https://x.edu/d"];
  assert(
    [...mergeClassifierBatch(batch, ["https://x.edu/a", "https://x.edu/b"])].length === 2,
    "a trusted batch keeps only what the model picked",
  );
  assert(
    [...mergeClassifierBatch(batch, [])].length === 4,
    "a batch returning nothing is distrusted and keeps the heuristic's URLs",
  );
  assert(
    [...mergeClassifierBatch(batch, ["https://x.edu/a — Bachelor of Arts", "https://elsewhere.org/z"])].length === 4,
    "a pick that is not verbatim in the batch does not count, so the batch is distrusted, not silently emptied",
  );
  const roles = rolesFor(["https://x.edu/a", "https://x.edu/b", "https://x.edu/g"], new Set(["https://x.edu/a"]), ["https://x.edu/g"]);
  assert(roles.get("https://x.edu/a") === "course" && roles.get("https://x.edu/b") === "other", "picked → course, rest → other", [...roles]);
  assert(roles.get("https://x.edu/g") === "course", "a guided URL is always course, whatever the classifier said", [...roles]);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
