/**
 * Institution memory — end-to-end dry run against the REAL dev database, embeddings and Jev.
 *
 * Run: node --import tsx tests/institution-memory-dry-run.ts [--inst 49] [--keep]
 *
 * What it does, in order, printing what the pipeline decided at each step:
 *   1. an admin writes three memories (rule, policy, preference)         → tenant table, real vectors
 *   2. a visitor asks a question                                          → retrieveMemories: prompt block + ids
 *   3. the reply is stored with memory_ids; a counsellor CORRECTS it      → learnFromCorrection: Jev + extractor
 *   4. a student thumbs the reply down                                    → learnFromFeedback: Jev attribution
 *   5. a finished conversation on an auto_learn widget                    → learnFromConversation
 *   6. a correction that contradicts the admin policy                     → stored as a conflicting candidate
 *   7. the sweep runs
 *
 * Everything it creates — a temporary widget config, a visitor session and its messages, and the
 * memories — is deleted at the end unless --keep is passed. Nothing goes through the queue: jobs
 * run in-process via runLearnJob, exactly what the worker would call.
 */

import "dotenv/config";
import { masterKnex } from "../src/core/db/master-pool.js";
import * as mem from "../src/modules/institution-memory/index.js";
import { _memoryDeps } from "../src/modules/institution-memory/repositories/memory.repository.js";
import { config } from "../src/config.js";

const args = process.argv.slice(2);
const INST = Number(args[args.indexOf("--inst") + 1]) || 49;
const KEEP = args.includes("--keep");
const created: { memoryIds: string[]; sessionId: number | null; configId: number | null } = { memoryIds: [], sessionId: null, configId: null };
const say = (label: string, v?: unknown) => console.log(`\n▶ ${label}${v === undefined ? "" : "\n" + (typeof v === "string" ? v : JSON.stringify(v, null, 2))}`);
const brief = (m: { id: string; type: string; status: string; source: string; confidence: number; content: string; conflicts_with_id?: string | null }) =>
  `${m.type} [${m.status}, ${m.source}, conf ${m.confidence.toFixed(2)}${m.conflicts_with_id ? `, conflicts ${m.conflicts_with_id.slice(0, 8)}` : ""}] ${m.id.slice(0, 8)} — ${m.content}`;

const inst = await masterKnex("institutions").where({ id: INST }).whereNotNull("schema_provisioned_at").first("id", "institution_name", "schema_name");
if (!inst) { console.error(`institution ${INST} is not provisioned`); process.exit(1); }
const tenant = await _memoryDeps.tenantDb(INST);
if (!tenant) { console.error("no tenant connection"); process.exit(1); }
say(`Institution ${INST}: ${inst.institution_name}`, {
  jev: mem.isJevConfigured(), embedding_provider: config.EMBEDDING_PROVIDER, keep_rows: KEEP,
});

try {
  // ── 1. Admin memories ─────────────────────────────────────────────────────
  const admin = { kind: "admin" as const, id: "dry-run" };
  const adminInputs = mem.CreateMemorySchema.array().parse([
    { type: "AVOIDANCE_RULE", content: "Never recommend the Diploma of Nursing to a student who has not yet taken an English test.", importance: 5 },
    { type: "INSTITUTION_POLICY", content: "Refunds are discussed only after the student has received an offer letter.", importance: 4 },
    { type: "RESPONSE_PREFERENCE", content: "Keep replies to three short paragraphs and end with one question at most.", metadata: { detail_level: "brief" } },
  ]);
  for (const input of adminInputs) {
    const out = await mem.createMemory({ institutionId: INST, input, source: "admin", actor: admin });
    created.memoryIds.push(out.memory.id);
    say(`admin memory → ${out.outcome}`, brief(out.memory));
  }
  const repeat = await mem.createMemory({ institutionId: INST, input: adminInputs[1]!, source: "admin", actor: admin });
  say(`same policy written again → ${repeat.outcome} (dedupe; reinforce_count ${repeat.memory.reinforce_count})`);

  // ── 2. Retrieval ──────────────────────────────────────────────────────────
  mem.clearRetrievalCache();
  const r = await mem.retrieveMemories({
    institutionId: INST, institutionName: inst.institution_name, query: "Can I get my money back if I withdraw?",
    situation: "nationality Nepal; highest degree Bachelor", onTrace: (s) => console.log("   trace:", s),
  });
  say("retrieveMemories → prompt block", r.text || "(empty)");
  say("retrieveMemories → ids + scores", r.memories.map((m) => `${m.type} sim ${m.similarity.toFixed(3)} score ${m.score.toFixed(3)}`));

  // ── 3. A conversation, a reply with memory_ids, a counsellor correction ───
  created.configId = (await masterKnex("ai_embed_configs").insert({ institution_id: INST, display_name: "dry-run widget", auto_learn: true }).returning("id"))[0]!.id;
  const visitorKey = "dryrun" + Date.now().toString(16);
  created.sessionId = (await masterKnex("ai_counselor_sessions").insert({ visitor_key: visitorKey, embed_config_id: created.configId }).returning("id"))[0]!.id;
  const sid = created.sessionId!;
  const msg = async (role: "user" | "assistant", content: string) =>
    (await masterKnex("ai_counselor_messages").insert({ session_id: sid, role, content, sources: "[]", cards: "[]", chips: "[]", blocks: "[]", attachments: "[]" }).returning("id"))[0]!.id as number;
  await msg("user", "Hi, I am thinking about the nursing diploma. I have not done IELTS yet.");
  await msg("assistant", "Great choice! What draws you to nursing?");
  await msg("user", "Can I get my money back if I withdraw?");
  const replyId = await msg("assistant", "Yes, refunds are usually processed within 14 days of withdrawal.");
  await mem.recordMemoryIds(replyId, r.ids);
  await mem.recordReview(replyId, mem.ReviewMessageSchema.parse({
    status: "corrected",
    correction: "We only discuss refund timing after an offer letter is issued. Before that, ask whether they have applied yet, and point them to the refund policy page rather than quoting a number of days.",
    note: "Never quote refund days before an offer.",
  }), 0);
  const c = await mem.runLearnJob({ kind: "correction", institution_id: INST, message_id: replyId });
  say("learnFromCorrection → result", c);
  const afterCorrection = await mem.listMemories(INST, mem.MemoryQuerySchema.parse({ limit: 50 }));
  for (const m of afterCorrection) if (!created.memoryIds.includes(m.id)) created.memoryIds.push(m.id);
  say("memories now", afterCorrection.map(brief));

  // ── 4. Thumbs down → Jev decides which retrieved memories the reply followed ──
  const actor = mem.hashActor(`v:${visitorKey}`);
  await mem.recordFeedback(replyId, "negative", actor);
  say("Jev judgeFollowed: did the (wrong) reply follow the retrieved guidance?",
    [...(await mem.judgeFollowed("Yes, refunds are usually processed within 14 days of withdrawal.", r.memories.concat(r.pinned as never[]).map((m) => ({ id: m.id, content: m.content }))) ?? [])].length + " of " + r.ids.length + " followed");
  const f = await mem.runLearnJob({ kind: "feedback", institution_id: INST, message_id: replyId });
  say("learnFromFeedback (negative) → result", f);
  const voted = await mem.listMemories(INST, mem.MemoryQuerySchema.parse({ limit: 50 }));
  say("negative voters after thumbs-down (none = Jev spared guidance the reply ignored)", voted.filter((m) => m.source_reference.negative_voters.length).map((m) => `${m.type}: ${m.source_reference.negative_voters.length} vote(s)`));

  // A reply that DID follow the guidance, thumbed down → the vote lands.
  const goodId = await msg("assistant", "I can't go into refund timing until you have an offer letter. Have you applied yet?");
  await mem.recordMemoryIds(goodId, r.ids);
  await mem.recordFeedback(goodId, "negative", mem.hashActor("v:another-visitor"));
  await mem.runLearnJob({ kind: "feedback", institution_id: INST, message_id: goodId });
  const voted2 = await mem.listMemories(INST, mem.MemoryQuerySchema.parse({ limit: 50 }));
  say("negative voters after a thumbs-down on a reply that followed the policy", voted2.filter((m) => m.source_reference.negative_voters.length).map((m) => `${m.type}: ${m.source_reference.negative_voters.length} vote(s)`));

  // ── 5. Conversation learning (auto_learn on the temporary widget) ─────────
  await msg("user", "Also, can I work part time while studying?");
  await msg("assistant", "Before we get into hours, what level are you applying for? The rules differ by visa, so let's pin that down first.");
  const conv = await mem.runLearnJob({ kind: "conversation", institution_id: INST, session_id: sid });
  say("learnFromConversation → result", conv);

  // ── 6. A correction that contradicts the admin policy ─────────────────────
  const contraId = await msg("assistant", "Refunds: we cannot discuss those until you have an offer.");
  await mem.recordReview(contraId, mem.ReviewMessageSchema.parse({
    status: "corrected",
    correction: "Always discuss refund terms up front, before any offer, so the student can decide early.",
  }), 0);
  const contra = await mem.runLearnJob({ kind: "correction", institution_id: INST, message_id: contraId });
  say("contradicting correction → result", contra);
  const conflicting = await mem.listMemories(INST, mem.MemoryQuerySchema.parse({ conflicting: true, limit: 50 }));
  say("candidates flagged as conflicting", conflicting.map((m) => `${brief(m)} — ${m.history.map((h) => h.event + (h.reason ? ` (${h.reason})` : "")).join(" → ")}`));

  // ── 7. Jev directly, for the record ───────────────────────────────────────
  say("Jev judgeCandidate on a fact-like statement", await mem.judgeCandidate("Tuition for the nursing diploma is AUD 12,000 per year.", "INSTITUTION_POLICY"));
  say("Jev judgeCandidate on a technique", await mem.judgeCandidate("When a student asks about scholarships, ask their study level before listing any.", "RESPONSE_PATTERN"));

  // ── 8. Sweep ──────────────────────────────────────────────────────────────
  say("runSweep", await mem.runSweep());

  const final = await mem.listMemories(INST, mem.MemoryQuerySchema.parse({ limit: 50 }));
  for (const m of final) if (!created.memoryIds.includes(m.id)) created.memoryIds.push(m.id);
  say(`final state: ${final.length} memories`, final.map(brief));
} finally {
  if (KEEP) {
    say("kept rows", created);
  } else {
    if (created.memoryIds.length) await tenant("institution_ai_memories").whereIn("id", created.memoryIds).delete();
    if (created.sessionId) await masterKnex("ai_counselor_sessions").where({ id: created.sessionId }).delete(); // messages cascade
    if (created.configId) await masterKnex("ai_embed_configs").where({ id: created.configId }).delete();
    say("cleaned up", { memories: created.memoryIds.length, session: created.sessionId, config: created.configId });
  }
  await masterKnex.destroy();
  await tenant.destroy().catch(() => {});
}
process.exit(0);
