/**
 * Learning signals survive a broker outage (Greptile P2).
 *
 * Run: node --import tsx tests/institution-memory-recovery.ts  (or: npm run test:institution-memory-recovery)
 * Fake wire: tests/institution-memory.harness.ts — knex builds REAL SQL and the fake routes it,
 * so these assertions are about the statements the service actually emits. No DB, no broker.
 *
 * enqueueLearning is fire-and-forget on purpose: a dead broker must never fail the user's write.
 * The callers persist the signal on the message row BEFORE enqueuing, so an outage loses only
 * the replay — sweepUnlearnedSignals is what replays it once the broker is back.
 */

process.env.DB_USERNAME = process.env.DB_USERNAME || "x";
process.env.DB_PASSWORD = process.env.DB_PASSWORD || "x";
process.env.DB_NAME = process.env.DB_NAME || "x";
process.env.DB_HOST = process.env.DB_HOST || "127.0.0.1";
process.env.JWT_SECRET = process.env.JWT_SECRET || "x";
process.env.GEMINI_API_KEY = "test-key";
process.env.EMBEDDING_PROVIDER = "gemini";
process.env.TYPESAFE_API_KEY = "test-key";

const h = await import("./institution-memory.harness.js");
const { assert, reset, all, find, finish, INST } = h;
const learn = await import("../src/modules/institution-memory/services/learning.service.js");
const { queueService } = await import("../src/shared/queue/queueService.js");

// ── Broker fake ──────────────────────────────────────────────────────────────
let published: Array<Record<string, unknown>> = [];
let brokerUp = true;
(queueService as unknown as { publish: (q: string, j: unknown) => Promise<void> }).publish = async (_q, job) => {
  if (!brokerUp) throw new Error("ECONNREFUSED: broker down");
  published.push(job as Record<string, unknown>);
};

type Msg = {
  id: number; session_id: number; feedback: string | null; review_status: string | null; memory_ids: string[];
  feedback_learned_at: Date | null; review_learned_at: Date | null;
};
const msg = (o: Partial<Msg> & { id: number }): Msg =>
  ({ session_id: 90, feedback: null, review_status: null, memory_ids: [], feedback_learned_at: null, review_learned_at: null, ...o });

const SELECT_MSGS = /select .* from "ai_counselor_messages"/i;
const UPDATE_MSGS = /update "ai_counselor_messages"/i;

/** Route the three reads the sweep makes: candidate messages, the session, the widget config. */
function wire(rows: Msg[]) {
  reset([
    [SELECT_MSGS, () => rows.map(r => ({ ...r, role: "assistant", content: "c", feedback_actor: null, correction: null, review_note: null, reviewed_by: null }))],
    [/from "ai_counselor_sessions"/i, () => [{ id: 90, platform_user_id: null, visitor_key: "v1", embed_config_id: 7 }]],
    [/from "ai_embed_configs"/i, () => [{ id: 7, institution_id: INST, auto_learn: true }]],
    [UPDATE_MSGS, () => []],
  ]);
  published = [];
}

// ── 1. The recovery set is scoped correctly ──────────────────────────────────
wire([]);
await learn.sweepUnlearnedSignals();
const q = find(SELECT_MSGS);
assert(/"feedback_learned_at" is null/i.test(q?.text ?? "") && /"review_learned_at" is null/i.test(q?.text ?? ""),
  "sweep asks per signal, not per row");
assert(/feedback" is not null/i.test(q?.text ?? "") && /review_status" is not null/i.test(q?.text ?? ""),
  "…each paired with the signal that is actually carried");
assert(/interval '15 minutes'/i.test(q?.text ?? ""), "sweep honours the in-flight grace window");

// ── 2. A correction whose job never reached the broker is replayed ───────────
wire([msg({ id: 11, review_status: "corrected" })]);
let r = await learn.sweepUnlearnedSignals();
assert(r.requeued === 1, "corrected review is re-enqueued", r);
assert(published[0]?.kind === "correction" && published[0]?.message_id === 11, "…as a correction job", published[0]);
assert(published[0]?.institution_id === INST, "…for the owning institution", published[0]);

// ── 3. A thumb is replayed only when the reply actually used memories ────────
wire([msg({ id: 12, feedback: "negative", memory_ids: ["m1"] })]);
r = await learn.sweepUnlearnedSignals();
assert(published[0]?.kind === "feedback" && r.requeued === 1, "thumb on a memory-backed reply is re-enqueued", published[0]);

wire([msg({ id: 13, feedback: "positive", memory_ids: [] })]);
r = await learn.sweepUnlearnedSignals();
assert(r.requeued === 0, "bare thumb on a reply that used no memories is not re-enqueued", r);
assert(all(UPDATE_MSGS).some(s => /"feedback_learned_at"/.test(s.text) && s.values.includes(13)),
  "…and its OWN marker is stamped so the sweep stops reconsidering it");

// ── 4. An approved review that used no memories has nothing to learn ─────────
wire([msg({ id: 14, review_status: "approved", memory_ids: [] })]);
r = await learn.sweepUnlearnedSignals();
assert(r.requeued === 0, "approved review with no memories used is not re-enqueued", r);

// ── 5. Still down: the sweep reports honestly and leaves the row for next time ──
brokerUp = false;
wire([msg({ id: 15, review_status: "corrected" })]);
r = await learn.sweepUnlearnedSignals();
assert(r.found === 1 && r.requeued === 0, "broker still down: found but not requeued", r);
assert(!all(UPDATE_MSGS).some(s => /_learned_at"/.test(s.text) && s.values.includes(15)),
  "…and the row is NOT stamped, so the next sweep retries it");
brokerUp = true;

// ── Both signals on one message are independent ─────────────────────────────
// A review and a thumb are separate signals learned from by different jobs. One shared marker
// meant whichever ran first hid the other from recovery forever, and a row carrying both only
// ever enqueued the review (Greptile).
wire([msg({ id: 20, review_status: "corrected", feedback: "negative", memory_ids: ["m1"] })]);
r = await learn.sweepUnlearnedSignals();
assert(r.requeued === 2 && published.length === 2, "a message with BOTH signals pending enqueues both", r);
assert(published.some(p => p.kind === "correction") && published.some(p => p.kind === "feedback"),
  "…one correction job and one feedback job", published.map(p => p.kind));

// The already-learned half must not be re-enqueued, and the pending half must not be skipped.
wire([msg({ id: 21, review_status: "corrected", review_learned_at: new Date(), feedback: "negative", memory_ids: ["m1"] })]);
r = await learn.sweepUnlearnedSignals();
assert(r.requeued === 1 && published[0]?.kind === "feedback",
  "a thumb still pending is recovered even though the review was already learned from", published.map(p => p.kind));

wire([msg({ id: 22, review_status: "corrected", feedback: "negative", feedback_learned_at: new Date(), memory_ids: ["m1"] })]);
r = await learn.sweepUnlearnedSignals();
assert(r.requeued === 1 && published[0]?.kind === "correction",
  "…and the mirror case: review pending, thumb already learned", published.map(p => p.kind));

// ── runLearnJob stamps ONLY its own signal's marker ─────────────────────────
// The sweep assertions above all pass even if both job kinds stamp the same column — that bug is
// invisible until a second signal arrives. These two are what catch it.
const stampRoutes = (m: Msg) => reset([
  [SELECT_MSGS, () => [{ ...m, role: "assistant", content: "c", feedback_actor: "a1", correction: null, review_note: null, reviewed_by: 1 }]],
  [/from "ai_counselor_sessions"/i, () => [{ id: 90, platform_user_id: null, visitor_key: "v1", embed_config_id: 7 }]],
  [/from "ai_embed_configs"/i, () => [{ id: 7, institution_id: INST, auto_learn: true }]],
  [UPDATE_MSGS, () => []],
]);
const markerCols = () => all(UPDATE_MSGS).filter(s => /_learned_at/.test(s.text)).map(s => s.text.match(/"(\w*_learned_at)"/)?.[1]);

// A thumb on a reply that used no memories: learnFromFeedback returns early, the stamp still runs.
stampRoutes(msg({ id: 30, feedback: "positive", memory_ids: [] }));
await learn.runLearnJob({ kind: "feedback", institution_id: INST, message_id: 30 });
assert(markerCols().includes("feedback_learned_at") && !markerCols().includes("review_learned_at"),
  "a feedback job stamps feedback_learned_at and NOT review_learned_at", markerCols());

// An approved review that used no memories: same early return, other marker.
stampRoutes(msg({ id: 31, review_status: "approved", memory_ids: [] }));
await learn.runLearnJob({ kind: "correction", institution_id: INST, message_id: 31 });
assert(markerCols().includes("review_learned_at") && !markerCols().includes("feedback_learned_at"),
  "a correction job stamps review_learned_at and NOT feedback_learned_at", markerCols());

// ── A session or widget that is gone is stamped, not skipped ────────────────
// Skipped rows sat at the head of the oldest-first batch forever; a batch's worth of them hid
// every newer lost signal from recovery.
reset([
  [SELECT_MSGS, () => [{ ...msg({ id: 50, feedback: "negative", memory_ids: ["m1"] }), role: "assistant", content: "c", feedback_actor: null, correction: null, review_note: null, reviewed_by: null }]],
  [/from "ai_counselor_sessions"/i, () => []],
  [UPDATE_MSGS, () => []],
]);
published = [];
r = await learn.sweepUnlearnedSignals();
assert(r.requeued === 0 && all(UPDATE_MSGS).some(s => /"feedback_learned_at"/.test(s.text) && s.values.includes(50)),
  "an ownerless signal is stamped learned so it stops blocking the batch", all(UPDATE_MSGS).map(s => s.text));

// ── A changed signal is a new signal ─────────────────────────────────────────
// Thumbs-up learned and stamped, then flipped to thumbs-down during an outage: the old marker
// must not hide the new vote from recovery. Same for a review re-done.
const learnRepo = await import("../src/modules/institution-memory/repositories/learning.repository.js");
reset([[UPDATE_MSGS, () => []]]);
await learnRepo.recordFeedback(60, "negative", "a1");
const fb = find(UPDATE_MSGS);
assert(/"feedback_learned_at" = /.test(fb?.text ?? ""), "recordFeedback clears feedback_learned_at", fb);
reset([[UPDATE_MSGS, () => []]]);
await learnRepo.recordReview(61, { status: "corrected", correction: "Say the real fee.", note: null } as never, 1);
const rv = find(UPDATE_MSGS);
assert(/"review_learned_at" = /.test(rv?.text ?? "") && !/"feedback_learned_at"/.test(rv?.text ?? ""),
  "recordReview clears review_learned_at and leaves the thumb's marker alone", rv);

// ── A stamp must not land on a signal the job never processed ───────────────
// The race: job A reads feedback="positive"; the student flips to "negative", which clears the
// marker and enqueues job B; job A finishes and stamps. If that stamp lands, and B's publish was
// lost to an outage, recovery sees "learned" and the negative is never applied (Greptile).
{
  // The message MOVED ON while the job ran: the row now reads "negative".
  const moved = { ...msg({ id: 40, feedback: "negative", memory_ids: [] }), role: "assistant", content: "c",
    feedback_actor: "a1", correction: null, review_note: null, reviewed_by: 1, reviewed_at: new Date("2026-09-29T10:00:00Z") };
  reset([
    [SELECT_MSGS, () => [moved]],
    [/from "ai_counselor_sessions"/i, () => [{ id: 90, platform_user_id: null, visitor_key: "v1", embed_config_id: 7 }]],
    [/from "ai_embed_configs"/i, () => [{ id: 7, institution_id: INST, auto_learn: true }]],
    [UPDATE_MSGS, () => []],
  ]);
  await learn.runLearnJob({ kind: "feedback", institution_id: INST, message_id: 40 });
  const stamp = all(UPDATE_MSGS).find(s => /"feedback_learned_at"/.test(s.text));
  assert(/"feedback" = \?|"feedback" is null/.test(stamp?.text ?? "") || stamp?.values.includes("negative"),
    "the feedback stamp is guarded on the value the job read", stamp?.text);

  // And the review side is guarded on reviewed_at, which recordReview refreshes every write.
  reset([
    [SELECT_MSGS, () => [{ ...moved, id: 41, review_status: "approved" }]],
    [/from "ai_counselor_sessions"/i, () => [{ id: 90, platform_user_id: null, visitor_key: "v1", embed_config_id: 7 }]],
    [/from "ai_embed_configs"/i, () => [{ id: 7, institution_id: INST, auto_learn: true }]],
    [UPDATE_MSGS, () => []],
  ]);
  await learn.runLearnJob({ kind: "correction", institution_id: INST, message_id: 41 });
  const rstamp = all(UPDATE_MSGS).find(s => /"review_learned_at"/.test(s.text));
  assert(/date_trunc\('milliseconds', reviewed_at\) = /.test(rstamp?.text ?? ""),
    "the review stamp guards on reviewed_at truncated to ms — plain equality matches 0 rows, "
    + "because PG stores microseconds and node-postgres returns a ms-precision JS Date", rstamp?.text);
  assert(!/"reviewed_at" = \$/.test(rstamp?.text ?? ""),
    "…and never uses raw equality on the timestamp", rstamp?.text);
}

await finish();
