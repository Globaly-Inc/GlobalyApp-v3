/**
 * The one-step-at-a-time gate (docs/data-extraction/2026-09-18-one-step-at-a-time-scraping-plan.md §5.1).
 *
 * What silently breaks the feature:
 *   1. auto mode must publish the next step — or the pipeline stalls after site_map forever
 *   2. manual mode must NOT publish — or "manual" is a label, not a gate
 *   3. stop_requested must NOT publish, whatever the mode
 *   4. a step with no successor publishes nothing and says so
 *   5. the classifier merge keeps a distrusted batch's heuristic URLs
 *   6. URL categories: guided key > classifier pick > path heuristic > null (model pass) — never a silent 'other',
 *      and every verdict carries the source that produced IT (provenance is per URL, not per job)
 *
 * Run: node --import tsx tests/step-gate.ts   (or: npm run test:step-gate)
 * No queue, no database — swapped through _stepDeps.
 */

import "dotenv/config";
import { _stepDeps, advance, gate, mergeClassifierBatch } from "../src/modules/superadmin/data-extraction/lib/pipeline-steps.js";
import { categoriesFor, guidedUrlCategories, heuristicCategory } from "../src/modules/superadmin/data-extraction/lib/url-categories.js";

let passed = 0;
let failed = 0;
function assert(condition: boolean, label: string, detail?: unknown) {
  if (condition) { passed++; console.log(`  ok   ${label}`); }
  else { failed++; console.error(`  FAIL ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`); }
}

// ── In-memory stand-ins ──
let job: { step_mode: "auto" | "manual"; stop_requested: boolean; status?: string } | undefined = { step_mode: "auto", stop_requested: false };
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

console.log("\n3b. a paused job waits even in auto");
{
  // The snapshot's halt check runs every 25 pages, so a batch can finish clean AFTER the admin
  // paused and be the one that completes the run. The gate is the last line: it must not publish
  // site_analysis for a job that is paused (or failed/declined) whatever the tally said.
  for (const status of ["paused", "failed", "declined"]) {
    reset();
    job = { step_mode: "auto", stop_requested: false, status };
    const r = await advance("job-1", "site_snapshot");
    assert(r === "waiting" && published.length === 0 && progress.site_analysis === "waiting", `${status} job: nothing published, successor marked waiting`, { r, published, progress });
  }
  reset();
  job = { step_mode: "auto", stop_requested: false, status: "processing" };
  assert((await advance("job-1", "site_snapshot")) === "published", "a processing job still chains");
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
}

console.log("\n6. URL categories");
{
  assert(heuristicCategory("https://x.edu/") === "overview", "the homepage is the overview");
  assert(heuristicCategory("https://x.edu/about-us/history") === "about_us", "about → about_us");
  assert(heuristicCategory("https://x.edu/contact") === "contact_us", "contact → contact_us");
  assert(heuristicCategory("https://x.edu/study/fees-and-scholarships") === "fees", "fees → fees");
  assert(heuristicCategory("https://x.edu/international/entry-requirements") === "eligibility", "entry requirements → eligibility");
  assert(heuristicCategory("https://x.edu/key-dates") === "intake", "key dates → intake");
  assert(heuristicCategory("https://x.edu/our-campuses/melbourne") === "branches", "campuses → branches");
  assert(heuristicCategory("https://x.edu/find-an-agent") === "agents", "agents → agents");
  assert(heuristicCategory("https://x.edu/about/accreditation") === "accreditations", "accreditation beats about (more specific first)");
  assert(heuristicCategory("https://x.edu/news/open-day") === "other", "news → other");
  assert(heuristicCategory("https://x.edu/something-unusual") === null, "no signal → null, left for the model");

  const guided = guidedUrlCategories({ fees_urls: ["https://x.edu/g-fees"], course_list_urls: ["https://x.edu/g-courses"], team_urls: ["https://x.edu/team"], junk: "no" });
  assert(guided.get("https://x.edu/g-fees") === "fees" && guided.get("https://x.edu/g-courses") === "course" && guided.get("https://x.edu/team") === "agents", "guided keys map to categories", [...guided]);
  assert(guidedUrlCategories(["https://x.edu/legacy"]).get("https://x.edu/legacy") === "course", "legacy array form is all course");

  const cats = categoriesFor(
    ["https://x.edu/a", "https://x.edu/news/b", "https://x.edu/g-fees", "https://x.edu/mystery"],
    new Set(["https://x.edu/a", "https://x.edu/g-fees"]),
    guided,
    "llm",
  );
  const v = (u: string) => cats.get(u);
  assert(v("https://x.edu/a")?.category === "course" && v("https://x.edu/a")?.source === "llm", "picked → course, sourced to the course pass (llm here)", [...cats]);
  assert(v("https://x.edu/g-fees")?.category === "fees" && v("https://x.edu/g-fees")?.source === "guided", "a guided URL keeps its guided category AND source even when the classifier picked it", [...cats]);
  assert(v("https://x.edu/news/b")?.category === "other" && v("https://x.edu/news/b")?.source === "heuristic", "heuristic fills the rest and says so", [...cats]);
  assert(v("https://x.edu/mystery") === null, "no signal stays null for the model pass", [...cats]);
  assert(v("https://x.edu/g-courses")?.category === "course" && v("https://x.edu/g-courses")?.source === "guided", "a guided URL not on the list is still categorised", [...cats]);
  const heur = categoriesFor(["https://x.edu/a"], new Set(["https://x.edu/a"]), new Map(), "heuristic");
  assert(heur.get("https://x.edu/a")?.source === "heuristic", "a heuristic-only course pass is not blamed on the model", [...heur]);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
