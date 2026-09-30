/**
 * Demo data for institution counselling memory. Dev DB only.
 *
 *   npm run demo:institution-memory -- --inst 49            seed: admin rules + learned candidates + a
 *                                                            widget conversation waiting for review
 *   npm run demo:institution-memory -- --inst 49 --learn    then: a counsellor corrects the reply and a
 *                                                            student thumbs it, in-process (what the
 *                                                            worker would do), and prints what was learned
 *   npm run demo:institution-memory -- --inst 49 --reset    delete every memory of that institution and
 *                                                            the demo sessions, so the demo can be re-run
 *
 * Real embeddings (EMBEDDING_PROVIDER) and Jev if TYPESAFE_API_KEY is set. Restart the backend after
 * seeding only if it was started before this branch's code; retrieval reads the DB on every turn.
 */

import "dotenv/config";
import { masterKnex } from "../src/core/db/master-pool.js";
import * as mem from "../src/modules/institution-memory/index.js";
import { _memoryDeps } from "../src/modules/institution-memory/repositories/memory.repository.js";

const args = process.argv.slice(2);
const INST = Number(args[args.indexOf("--inst") + 1]) || 49;
const MODE = args.includes("--reset") ? "reset" : args.includes("--learn") ? "learn" : "seed";
const DEMO_TITLE = "[demo] Refund question";

const say = (label: string, v?: unknown) => console.log(`\n▶ ${label}${v === undefined ? "" : "\n" + (typeof v === "string" ? v : JSON.stringify(v, null, 2))}`);
const brief = (m: { type: string; status: string; source: string; confidence: number; content: string; conflicts_with_id?: string | null; flagged_at?: Date | null }) =>
  `${m.status.padEnd(10)} ${m.source.padEnd(10)} ${m.type.padEnd(26)} ${m.confidence.toFixed(2)}${m.conflicts_with_id ? "  ⚠ conflicts" : ""}${m.flagged_at ? "  ⚑ flagged" : ""}  ${m.content}`;
const listAll = async () => mem.listMemories(INST, mem.MemoryQuerySchema.parse({ limit: 200 }));

const inst = await masterKnex("institutions").where({ id: INST }).whereNotNull("schema_provisioned_at").first("id", "institution_name");
if (!inst) { console.error(`institution ${INST} is not provisioned`); process.exit(1); }
const widget = await masterKnex("ai_embed_configs").where({ institution_id: INST, is_active: true }).orderBy("id").first();
if (!widget) { console.error(`institution ${INST} has no active widget — create one in /business/ai-widget first`); process.exit(1); }
const tenant = await _memoryDeps.tenantDb(INST);
if (!tenant) { console.error("no tenant connection"); process.exit(1); }
const name: string = inst.institution_name;
say(`${name} (institution ${INST}), widget ${widget.id} "${widget.display_name}", key ${widget.embed_key}`, { mode: MODE, jev: mem.isJevConfigured() });

const admin = { kind: "admin" as const, id: "demo" };
const student = (n: number) => mem.hashActor(`v:demo-student-${n}`);

try {
  if (MODE === "reset") {
    const n = await tenant("institution_ai_memories").delete();
    const s = await masterKnex("ai_counselor_sessions").where({ embed_config_id: widget.id }).where("title", "like", "[demo]%").delete();
    say("reset", { memories_deleted: n, demo_sessions_deleted: s });
  }

  if (MODE === "seed") {
    // ── 1. What the institution tells its counsellor ─────────────────────────
    const rules = mem.CreateMemorySchema.array().parse([
      { type: "AVOIDANCE_RULE", importance: 5, content: "Never recommend a nursing or health course to a student who has not yet taken an English test; ask about the test first." },
      { type: "INSTITUTION_POLICY", importance: 4, content: "Refund timelines are discussed only after the student has an offer letter; before that, point them to the refund policy page." },
      { type: "COUNSELLING_GUIDELINE", importance: 5, content: `Always close by offering to connect the student with a human ${name} counsellor for anything you cannot answer.` },
      { type: "RESPONSE_PREFERENCE", metadata: { tone: "warm_formal", detail_level: "brief" }, content: "Keep replies to three short paragraphs and end with at most one question." },
      { type: "COURSE_RECOMMENDATION_RULE", importance: 4, metadata: { prefer: ["diploma pathway"] }, content: "For a student without a completed bachelor degree, suggest the diploma pathway before any master's program." },
      { type: "TERMINOLOGY", metadata: { term: "intake", meaning: "the start date of a course", use_instead_of: ["semester start"] }, content: `Use the word "intake" for course start dates, as ${name} does on its website.` },
      { type: "STUDENT_CONCERN_PATTERN", metadata: { concern: "working while studying", approach: "confirm visa type first" }, content: "When a student asks about working while studying, confirm which visa they will hold before discussing hours." },
    ]);
    for (const input of rules) {
      const out = await mem.createMemory({ institutionId: INST, input, source: "admin", actor: admin });
      say(`admin rule → ${out.outcome}`, brief(out.memory));
    }

    // ── 2. What it has learned so far (candidates, awaiting a human or more students) ──
    const learned = mem.CreateMemorySchema.array().parse([
      { type: "RESPONSE_PATTERN", metadata: { technique: "clarify_first", trigger: "scholarship question" }, content: "When a student asks about scholarships, ask their study level before listing any." },
      { type: "STUDENT_CONCERN_PATTERN", metadata: { concern: "moving abroad alone", approach: "acknowledge, then point to orientation and support services" }, content: "Students worried about moving abroad alone respond well to hearing about orientation week and student support before any course detail." },
    ]);
    for (const [i, input] of learned.entries()) {
      const out = await mem.createMemory({ institutionId: INST, input, source: "extracted", actor: { kind: "system" }, confidence: 0.72 + i * 0.1, evidenceActor: student(i) });
      say(`learned candidate → ${out.outcome}`, brief(out.memory));
    }
    // A learned statement that contradicts the refund policy: stored, linked, never auto-promoted.
    const policy = (await listAll()).find((m) => m.type === "INSTITUTION_POLICY")!;
    const conflict = await mem.flagConflict({
      institutionId: INST, conflictsWithId: policy.id, confidence: 0.65, actor: { kind: "system" }, evidenceActor: student(9),
      input: mem.CreateMemorySchema.parse({ type: "INSTITUTION_POLICY", content: "Tell students the refund timeline up front, before they apply, so they can decide early." }),
    });
    if (conflict) say("learned candidate that CONTRADICTS the refund policy → stored linked", brief(conflict));

    // ── 3. A widget conversation waiting for a counsellor's review ───────────
    const visitorKey = "demo-student-" + Date.now().toString(16);
    const sessionId = (await masterKnex("ai_counselor_sessions").insert({ visitor_key: visitorKey, embed_config_id: widget.id, title: DEMO_TITLE, message_count: 4 }).returning("id"))[0]!.id as number;
    const msg = async (role: "user" | "assistant", content: string, memoryIds: string[] = []) =>
      (await masterKnex("ai_counselor_messages").insert({ session_id: sessionId, role, content, sources: "[]", cards: "[]", chips: "[]", blocks: "[]", attachments: "[]", memory_ids: JSON.stringify(memoryIds) }).returning("id"))[0]!.id as number;
    const guideline = (await listAll()).find((m) => m.type === "COUNSELLING_GUIDELINE")!;
    await msg("user", "Hi! I want to study nursing but I haven't done IELTS yet.");
    await msg("assistant", `Welcome to ${name}! Before we look at nursing, have you booked an English test yet? That decides which intake you can aim for.`, [guideline.id]);
    await msg("user", "Not yet. Also, if I change my mind can I get my money back?");
    await msg("assistant", "Yes, refunds are usually processed within 14 days of withdrawal, so you have flexibility there.", [policy.id, guideline.id]);
    say("demo conversation created (unreviewed) — the second reply broke the refund policy", { session_id: sessionId });

    mem.clearRetrievalCache();
    const r = await mem.retrieveMemories({ institutionId: INST, institutionName: name, query: "Can I get my money back if I withdraw?", onTrace: (s) => console.log("   trace:", s) });
    say("what the widget's prompt now carries for a refund question", r.text);
  }

  if (MODE === "learn") {
    const reply = await masterKnex("ai_counselor_messages as m")
      .join("ai_counselor_sessions as s", "s.id", "m.session_id")
      .where({ "s.embed_config_id": widget.id, "s.title": DEMO_TITLE, "m.role": "assistant" }).whereNull("m.review_status")
      .orderBy("m.id", "desc").first("m.id", "m.content");
    if (!reply) { console.error("no unreviewed demo reply — run without --learn first"); process.exit(1); }

    // A counsellor corrects the reply (POST /messages/:id/review does exactly this).
    await mem.recordReview(reply.id, mem.ReviewMessageSchema.parse({
      status: "corrected",
      correction: "I can't go into refund timelines until you have an offer letter — our refund policy page has the full terms. Have you started an application yet?",
      note: "Never quote a number of days before an offer.",
    }), 0);
    say(`counsellor corrected reply ${reply.id}`, reply.content);
    say("worker: learnFromCorrection →", await mem.runLearnJob({ kind: "correction", institution_id: INST, message_id: reply.id }));

    // A student thumbs the same (wrong) reply down. Jev attributes the vote to the guidance
    // the reply actually followed — the refund policy it ignored is spared.
    await mem.recordFeedback(reply.id, "negative", student(1));
    say("worker: learnFromFeedback (thumbs-down) →", await mem.runLearnJob({ kind: "feedback", institution_id: INST, message_id: reply.id }));

    // Two more students reinforce the scholarship technique → it promotes on its own.
    // By content, not by type: the correction above just derived another RESPONSE_PATTERN candidate.
    const tech = (await listAll()).find((m) => m.status === "candidate" && /scholarship/i.test(m.content));
    if (tech) {
      for (const n of [2, 3]) await mem.createMemory({ institutionId: INST, input: mem.CreateMemorySchema.parse({ type: tech.type, content: tech.content, metadata: tech.metadata }), source: "extracted", actor: { kind: "system" }, confidence: 0.8, evidenceActor: student(n) });
      const now = await mem.findMemory(tech.id, INST);
      say(`scholarship technique after 3 distinct students → ${now?.status}`, `${now?.reinforce_count} reinforcements, actors ${now?.source_reference.actors.length}`);
    }
  }

  const final = await listAll();
  say(`${name}: ${final.length} memories`, final.map(brief).join("\n"));
  const queue = await masterKnex("ai_counselor_messages as m").join("ai_counselor_sessions as s", "s.id", "m.session_id")
    .where({ "s.embed_config_id": widget.id, "m.role": "assistant" }).whereNull("m.review_status").count("* as c").first();
  say("replies waiting for review on this widget", Number(queue?.c ?? 0));
} finally {
  await masterKnex.destroy();
  await tenant.destroy().catch(() => {});
}
process.exit(0);
