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

type Msg = { id: number; session_id: number; feedback: string | null; review_status: string | null; memory_ids: string[] };
const msg = (o: Partial<Msg> & { id: number }): Msg =>
  ({ session_id: 90, feedback: null, review_status: null, memory_ids: [], ...o });

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
assert(/"learned_at" is null/i.test(q?.text ?? ""), "sweep asks only for unlearned rows");
assert(/feedback" is not null|review_status" is not null/i.test(q?.text ?? ""), "sweep asks only for rows carrying a signal");
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
assert(all(UPDATE_MSGS).some(s => /"learned_at"/.test(s.text) && s.values.includes(13)),
  "…and is stamped so the sweep stops reconsidering it");

// ── 4. An approved review that used no memories has nothing to learn ─────────
wire([msg({ id: 14, review_status: "approved", memory_ids: [] })]);
r = await learn.sweepUnlearnedSignals();
assert(r.requeued === 0, "approved review with no memories used is not re-enqueued", r);

// ── 5. Still down: the sweep reports honestly and leaves the row for next time ──
brokerUp = false;
wire([msg({ id: 15, review_status: "corrected" })]);
r = await learn.sweepUnlearnedSignals();
assert(r.found === 1 && r.requeued === 0, "broker still down: found but not requeued", r);
assert(!all(UPDATE_MSGS).some(s => /"learned_at"/.test(s.text) && s.values.includes(15)),
  "…and the row is NOT stamped, so the next sweep retries it");
brokerUp = true;

await finish();
