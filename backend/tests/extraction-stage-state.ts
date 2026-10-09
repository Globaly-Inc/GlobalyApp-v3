/**
 * The portal's three crawl stages, derived from pipeline_progress by stageState
 * (services/jobs.service.ts). Pure — no DB. Run: node --import tsx tests/extraction-stage-state.ts
 *
 * The values worth pinning: "Crawling" spans site_mapping AND course_discovery, so it must not
 * read done until both are, and the admission write (one key processing, the rest waiting) must
 * light exactly one stage.
 */

import "dotenv/config";

process.env.DB_USERNAME = process.env.DB_USERNAME || "x";
process.env.DB_PASSWORD = process.env.DB_PASSWORD || "x";
process.env.DB_NAME = process.env.DB_NAME || "x";
process.env.JWT_SECRET = process.env.JWT_SECRET || "x";

const { stageState } = await import("../src/modules/superadmin/data-extraction/services/jobs.service.js");

const CRAWLING = ["site_mapping", "course_discovery"];
const ORGANISING = ["data_extraction"];
const FLAGGING = ["verification"];

let passed = 0;
let failed = 0;

function assert(cond: boolean, label: string) {
  if (cond) passed++;
  else { failed++; console.error(`FAIL: ${label}`); }
}

// What extraction-job.worker.ts writes the moment a job is admitted.
const admitted = { site_mapping: "processing", course_discovery: "waiting", data_extraction: "waiting", verification: "waiting" };
assert(stageState(admitted, CRAWLING) === "processing", "admission: crawling is running");
assert(stageState(admitted, ORGANISING) === "waiting", "admission: organising waits");
assert(stageState(admitted, FLAGGING) === "waiting", "admission: flagging waits");

// pipeline-steps.ts:625 — the crawl is over, extraction is running.
const extracting = { site_mapping: "done", course_discovery: "done", data_extraction: "processing", verification: "waiting" };
assert(stageState(extracting, CRAWLING) === "done", "extracting: crawling finished");
assert(stageState(extracting, ORGANISING) === "processing", "extracting: organising is running");

// queue-completion.ts:105 — last stage.
const verifying = { site_mapping: "done", course_discovery: "done", data_extraction: "done", verification: "processing" };
assert(stageState(verifying, FLAGGING) === "processing", "verifying: flagging is running");

// A half-finished crawl must not claim to be done.
assert(stageState({ site_mapping: "done", course_discovery: "waiting" }, CRAWLING) === "processing", "half-done crawl is not done");

// Jobs that were never admitted, and other writers' object-shaped values.
assert(stageState(null, CRAWLING) === "waiting", "no progress at all is waiting");
assert(stageState({}, CRAWLING) === "waiting", "empty progress is waiting");
assert(stageState({ data_extraction: { status: "processing", done: 3, total: 9 } }, ORGANISING) === "processing", "object-shaped value is read");
assert(stageState({ verification: "queued" }, FLAGGING) === "waiting", "an unknown value is not treated as progress");

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
