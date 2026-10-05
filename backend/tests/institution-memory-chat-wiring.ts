/**
 * Institution memory → embed chat wiring: the prompt section lands after BOUNDARIES with its
 * own hard-limits line, and the assistant message row carries the ids it was shaped by.
 *
 * Run: node --import tsx tests/institution-memory-chat-wiring.ts
 * Fake wire: tests/institution-memory.harness.ts. No DB needed. No model call.
 */

process.env.DB_USERNAME = process.env.DB_USERNAME || "x";
process.env.DB_PASSWORD = process.env.DB_PASSWORD || "x";
process.env.DB_NAME = process.env.DB_NAME || "x";
process.env.DB_HOST = process.env.DB_HOST || "127.0.0.1";
process.env.JWT_SECRET = process.env.JWT_SECRET || "x";
process.env.GEMINI_API_KEY = "test-key";
process.env.EMBEDDING_PROVIDER = "gemini";

const h = await import("./institution-memory.harness.js");
const { assert, finish, reset, find, ID } = h;
const { buildSystemPrompt } = await import("../src/modules/ai-counsellor/services/prompt.service.js");
const messagesRepo = await import("../src/modules/ai-counsellor/repositories/messages.repository.js");

console.log("\n1. buildSystemPrompt places institution guidance after BOUNDARIES");
{
  const guidance = "INSTITUTION COUNSELLING GUIDANCE (from Test Uni)\n  Rules:\n  - [never] X\nHARD LIMITS STILL APPLY: never reveal personal data.";
  const prompt = buildSystemPrompt({
    profile: null, ragContext: "THIS INSTITUTION: Test Uni", isFirstMessage: true,
    embedConfig: { display_name: "Test Uni", custom_instructions: null },
    institutionGuidance: guidance,
  });
  const at = (s: string) => prompt.indexOf(s);
  assert(at("INSTITUTION COUNSELLING GUIDANCE") > at("BOUNDARIES:"), "guidance comes after BOUNDARIES");
  assert(at("INSTITUTION COUNSELLING GUIDANCE") < at("CONTEXT:\n"), "guidance comes before the CONTEXT block");
  const without = buildSystemPrompt({ profile: null, ragContext: "", isFirstMessage: true, embedConfig: { display_name: "Test Uni", custom_instructions: null } });
  assert(!without.includes("INSTITUTION COUNSELLING GUIDANCE"), "no section when there is no guidance");
  assert(without.includes("You speak AS Test Uni, in the first person plural"), "embed prompt carries the first-person voice rule");
  const platform = buildSystemPrompt({ profile: null, ragContext: "", isFirstMessage: true });
  assert(!platform.includes("VOICE: You speak AS"), "platform chat has no institution voice rule");
  const guarded = buildSystemPrompt({ profile: null, ragContext: "", isFirstMessage: false, embedConfig: { display_name: "Test Uni", custom_instructions: null }, withheldMoneyTopics: ["fees"] });
  assert(guarded.includes("NO MONEY DATA THIS TURN"), "money guard section present when retrieval found no money data");
  assert(!without.includes("NO MONEY DATA THIS TURN"), "money guard absent otherwise");
  // The guard must gag the money clause, not the turn: asked to compare two programs on fees,
  // duration and intakes, the widget answered "we don't have that specific information" and
  // dropped duration and intakes with it (observed live 2026-10-05).
  assert(guarded.includes("fees"), "the guard names which topic is ungrounded, not all of them");
  assert(!guarded.includes("asked about fees, refunds, scholarships, funding or costs"),
    "the guard no longer lists every money topic regardless of what was asked");
  assert(/ANSWER THE REST OF THE QUESTION/i.test(guarded),
    "the guard orders the non-money part of the question answered in full");
  const guardedAll = buildSystemPrompt({ profile: null, ragContext: "", isFirstMessage: false, withheldMoneyTopics: ["refund", "scholarship"] });
  assert(guardedAll.includes("refunds") && guardedAll.includes("scholarships"), "multiple withheld topics are both named");
  const unguarded = buildSystemPrompt({ profile: null, ragContext: "", isFirstMessage: false, withheldMoneyTopics: [] });
  assert(!unguarded.includes("NO MONEY DATA THIS TURN"), "an empty topic list is not a guard");
  assert(without.includes("MONEY IS THE EXCEPTION"), "standing money rule always present");
}

console.log("\n2. messages.create writes memory_ids only when there are some");
{
  const INSERT_MSG = /^insert into "ai_counselor_messages"/i;
  reset([[INSERT_MSG, () => [{ id: 1 }]]]);
  await messagesRepo.create({ session_id: 1, role: "assistant", content: "hi", memory_ids: [ID] });
  const withIds = find(INSERT_MSG);
  assert(withIds.text.includes('"memory_ids"') && withIds.values.includes(JSON.stringify([ID])), "memory_ids column bound to the JSON id list", withIds.values);

  reset([[INSERT_MSG, () => [{ id: 2 }]]]);
  await messagesRepo.create({ session_id: 1, role: "assistant", content: "hi", memory_ids: [] });
  assert(!find(INSERT_MSG).text.includes('"memory_ids"'), "empty list leaves the column to its default");
}

console.log("\n3. student-facing message list selects explicit columns");
{
  const SELECT_MSG = /^select .* from "ai_counselor_messages"/i;
  reset([[SELECT_MSG, () => []]]);
  await messagesRepo.findBySession(1, { limit: 5 });
  const text = find(SELECT_MSG).text;
  assert(!/select \*/.test(text) && /"feedback"/.test(text) && /"cards"/.test(text), "named columns, not select *", text);
  assert(!/review_status|correction|review_note|reviewed_by|feedback_actor|memory_ids/.test(text), "internal learning columns are not selected", text);
}

await finish();
