/**
 * After the last page: branches → scholarships → verify, in order, so the linker (dispatched when
 * verification ends) sees the campuses and awards. Run: npm run test:post-extraction-chain
 */
import { _chainDeps, continueChain, parseChain, pendingChain, postExtractionChain } from "../src/modules/superadmin/data-extraction/lib/queue-completion.js";
import { EXTRACTION_QUEUES } from "../src/modules/superadmin/data-extraction/shared/queues.js";

let passed = 0;
let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else { failed++; console.error(`FAIL ${label}\n  expected ${e}\n  got      ${a}`); }
}

eq(postExtractionChain({ needsBranches: true, hasScholarshipPages: true }), ["branches", "scholarships", "verify"], "campuses and scholarships run BEFORE verification");
eq(postExtractionChain({ needsBranches: false, hasScholarshipPages: true }), ["scholarships", "verify"], "no branches needed");
eq(postExtractionChain({ needsBranches: false, hasScholarshipPages: false }), ["verify"], "nothing to extract first → straight to verification");

eq(parseChain(["scholarships", "verify"]), ["scholarships", "verify"], "a message's chain is read back");
eq(parseChain(["verify", "drop_tables", 7]), ["verify"], "unknown links are ignored");
eq(parseChain(undefined), [], "no chain on a hand-run step");

const sent: Array<{ queue: string; payload: Record<string, unknown> }> = [];
const saved: Array<{ jobId: string; chain: unknown }> = [];
const order: string[] = [];
let failNext = 0;
_chainDeps.retryDelayMs = 1;
_chainDeps.savePending = async (jobId, chain) => { saved.push({ jobId, chain }); order.push("save"); };
_chainDeps.publish = async (queue, payload) => {
  order.push("publish");
  if (failNext > 0) { failNext--; throw new Error("broker down"); }
  sent.push({ queue, payload });
};

await continueChain("job-1", ["branches", "scholarships", "verify"]);
eq(sent[0], { queue: EXTRACTION_QUEUES.STEPS, payload: { jobId: "job-1", step: "branches", then: ["scholarships", "verify"] } }, "the head runs, carrying the rest");
eq([saved[0]?.chain, order], [["branches", "scholarships", "verify"], ["save", "publish"]], "the remaining chain is saved on the job BEFORE the publish");
sent.length = 0;
await continueChain("job-1", ["verify"]);
eq(sent[0], { queue: EXTRACTION_QUEUES.VERIFY, payload: { jobId: "job-1" } }, "the last link publishes VERIFY");
sent.length = 0;
await continueChain("job-1", []);
eq(sent.length, 0, "an empty chain publishes nothing");

failNext = 2; sent.length = 0;
await continueChain("job-1", ["scholarships", "verify"]);
eq(sent.length, 1, "a broker blip is retried and the step still goes out");

failNext = 5; sent.length = 0; saved.length = 0;
let threw = false;
try { await continueChain("job-1", ["scholarships", "verify"]); } catch { threw = true; }
eq([threw, sent.length, saved[0]?.chain], [true, 0, ["scholarships", "verify"]], "a publish that keeps failing throws, and the remaining steps stay saved for the sweep");

eq(pendingChain({ post_extraction_chain: ["scholarships", "verify"] }), ["scholarships", "verify"], "the sweep resumes the saved remainder");
eq(pendingChain(JSON.stringify({ post_extraction_chain: ["branches", "scholarships", "verify"] })), ["branches", "scholarships", "verify"], "…from a string-typed pipeline_progress too");
eq(pendingChain({ site_map: "done" }), ["verify"], "nothing saved (an older run) → just verification, as before");

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
