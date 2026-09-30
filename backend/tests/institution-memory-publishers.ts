/**
 * Learning publishers — the three human signals reach the queue, with the right ownership
 * gates, and the row is written before the job is sent.
 *
 * Run: node --import tsx tests/institution-memory-publishers.ts
 * Fake wire: tests/institution-memory.harness.ts. Fake queue: queueService.publish. No DB, no broker.
 */

process.env.DB_USERNAME = process.env.DB_USERNAME || "x";
process.env.DB_PASSWORD = process.env.DB_PASSWORD || "x";
process.env.DB_NAME = process.env.DB_NAME || "x";
process.env.DB_HOST = process.env.DB_HOST || "127.0.0.1";
process.env.JWT_SECRET = process.env.JWT_SECRET || "x";
process.env.GEMINI_API_KEY = "test-key";
process.env.EMBEDDING_PROVIDER = "gemini";

const h = await import("./institution-memory.harness.js");
const { assert, finish, reset, all, count, ID, INST } = h;
const { queueService } = await import("../src/shared/queue/queueService.js");
const s = await import("../src/modules/ai-counsellor/services/learning-signals.service.js");

const published: unknown[] = [];
queueService.publish = async (_q: string, msg: unknown) => { published.push(msg); };

const MSG = /^select .* from "ai_counselor_messages"/i;
const SES = /^select .* from "ai_counselor_sessions"/i;
const CFG = /^select .* from "ai_embed_configs"/i;
const UPD = /^update "ai_counselor_messages"/i;

const message = (o: Record<string, unknown> = {}) => ({
  id: 10, session_id: 20, role: "assistant", content: "reply", feedback: null, feedback_actor: null,
  review_status: null, correction: null, review_note: null, memory_ids: [ID], ...o,
});
const session = (o: Record<string, unknown> = {}) => ({ id: 20, platform_user_id: 7, visitor_key: null, embed_config_id: 30, ...o });
const config = (o: Record<string, unknown> = {}) => ({ id: 30, institution_id: INST, business_id: null, auto_learn: false, ...o });

const wire = (m = message(), se = session(), c = config()) => {
  published.length = 0;
  reset([[MSG, () => [m]], [SES, () => [se]], [CFG, () => [c]], [UPD, () => []]]);
};

console.log("\n1. student feedback — owner, institution widget, memories used → row then job");
{
  wire();
  await s.recordStudentFeedback(10, "negative", { userId: 7 });
  assert(count(UPD) === 1 && all(UPD)[0].values.includes("negative"), "feedback written on the row");
  assert(typeof all(UPD)[0].values.find((v) => typeof v === "string" && /^[0-9a-f]{16}$/.test(v)) === "string", "actor stored as a 16-hex hash, not the user id");
  assert(published.length === 1 && JSON.stringify(published[0]) === JSON.stringify({ kind: "feedback", institution_id: INST, message_id: 10 }), "feedback job published", published);
}

console.log("\n2. student feedback — gates");
{
  wire(message(), session({ platform_user_id: 8 }));
  const err = await s.recordStudentFeedback(10, "positive", { userId: 7 }).catch((e: Error) => e);
  assert(err instanceof Error && count(UPD) === 0 && published.length === 0, "another user's message: not found, nothing written");

  wire(message({ memory_ids: [] }));
  await s.recordStudentFeedback(10, "positive", { userId: 7 });
  assert(count(UPD) === 1 && published.length === 0, "no memories shaped the reply: written, no job");

  wire(message(), session(), config({ institution_id: null, business_id: 3 }));
  await s.recordStudentFeedback(10, "positive", { userId: 7 });
  assert(count(UPD) === 1 && published.length === 0, "business widget: written, no job");

  wire(message(), session({ platform_user_id: null, visitor_key: "vk", embed_config_id: 30 }));
  await s.recordStudentFeedback(10, "positive", { visitorKey: "vk", embedConfigId: 30 });
  assert(published.length === 1, "widget visitor owns by (visitor_key, embed_config_id)");

  wire(message(), session({ platform_user_id: null, visitor_key: "vk", embed_config_id: 31 }));
  const other = await s.recordStudentFeedback(10, "positive", { visitorKey: "vk", embedConfigId: 30 }).catch((e: Error) => e);
  assert(other instanceof Error && published.length === 0, "same fingerprint on another widget: not found");
}

console.log("\n3. counsellor review");
{
  wire();
  await s.recordCounsellorReview(10, { status: "corrected", correction: "Say X instead." }, { userId: 99, institutionId: INST });
  const upd = all(UPD)[0];
  assert(count(UPD) === 1 && upd.values.includes("corrected") && upd.values.includes("Say X instead.") && upd.values.includes(99), "review columns written");
  assert(published.length === 1 && (published[0] as { kind: string }).kind === "correction", "correction job published");

  wire();
  await s.recordCounsellorReview(10, { status: "approved" }, { userId: 99, institutionId: INST });
  assert(count(UPD) === 1 && published.length === 1 && (published[0] as { kind: string }).kind === "correction", "approve with memories used: recorded and published");

  wire(message({ memory_ids: [] }));
  await s.recordCounsellorReview(10, { status: "flagged", note: "off" }, { userId: 99, institutionId: INST });
  assert(count(UPD) === 1 && published.length === 0, "flag with nothing used: recorded, no job");

  wire();
  const foreign = await s.recordCounsellorReview(10, { status: "corrected", correction: "x" }, { userId: 99, institutionId: INST + 1 }).catch((e: Error) => e);
  assert(foreign instanceof Error && count(UPD) === 0, "another institution's widget: not found, nothing written");

  wire(message({ role: "user" }));
  const user = await s.recordCounsellorReview(10, { status: "approved" }, { userId: 99, institutionId: INST }).catch((e: Error) => e);
  assert(user instanceof Error, "a student's own message cannot be reviewed");
}

console.log("\n4. conversation end");
{
  wire();
  await s.onConversationEnd(config({ auto_learn: false }) as never, "vk");
  assert(count(SES) === 0 && published.length === 0, "auto_learn off: no lookup, no job");

  wire();
  await s.onConversationEnd(config({ auto_learn: true }) as never, "vk");
  assert(published.length === 1 && JSON.stringify(published[0]) === JSON.stringify({ kind: "conversation", institution_id: INST, session_id: 20 }), "auto_learn on: conversation job for the visitor's session", published);
}

console.log("\n5. review surface reads are scoped to the institution's widgets");
{
  const learnRepo = await import("../src/modules/institution-memory/repositories/learning.repository.js");
  reset([[SES, () => []]]);
  assert((await learnRepo.findSessionsForConfigs([], { limit: 10 })).length === 0 && count(SES) === 0, "no widgets → no query");
  await learnRepo.findSessionsForConfigs([30, 31], { limit: 10, unreviewedOnly: true });
  const list = all(SES)[0];
  assert(/"s"\."embed_config_id" in \(\$\d, \$\d\)/.test(list.text) && /review_status IS NULL/.test(list.text) && list.values.includes(30) && list.values.includes(31), "sessions filtered to the given widgets, with the unreviewed predicate", list.text);
  assert(!/visitor_key|platform_user_id/.test(list.text.split(" from ")[0] ?? ""), "visitor identity is not selected");

  reset([[SES, () => []], [MSG, () => [message()]]]);
  assert((await learnRepo.findMessagesForReview(20, [30])) === null && count(MSG) === 0, "a thread not on one of the widgets: null, messages never read");
  reset([[SES, () => [{ id: 20 }]], [MSG, () => [message()]]]);
  const rows = await learnRepo.findMessagesForReview(20, [30]);
  assert(rows?.length === 1 && /review_status/.test(all(MSG)[0].text) && !/feedback_actor/.test(all(MSG)[0].text), "thread read with review columns, without the actor hash");
}

await finish();
