/**
 * After the last page: branches → scholarships → verify, in order, so the linker (dispatched when
 * verification ends) sees the campuses and awards. Run: npm run test:post-extraction-chain
 */
import { queueService } from "../src/shared/queue/queueService.js";
import { continueChain, parseChain, postExtractionChain } from "../src/modules/superadmin/data-extraction/lib/queue-completion.js";
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
(queueService as unknown as { publish: (q: string, p: Record<string, unknown>) => Promise<void> }).publish = async (queue, payload) => { sent.push({ queue, payload }); };

await continueChain("job-1", ["branches", "scholarships", "verify"]);
eq(sent[0], { queue: EXTRACTION_QUEUES.STEPS, payload: { jobId: "job-1", step: "branches", then: ["scholarships", "verify"] } }, "the head runs, carrying the rest");
sent.length = 0;
await continueChain("job-1", ["verify"]);
eq(sent[0], { queue: EXTRACTION_QUEUES.VERIFY, payload: { jobId: "job-1" } }, "the last link publishes VERIFY");
sent.length = 0;
await continueChain("job-1", []);
eq(sent.length, 0, "an empty chain publishes nothing");

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
