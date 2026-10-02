/**
 * Human takeover of widget chats: who answers, the 15-minute expiries, the handover prefilter,
 * the request contracts and how staff turns land in the summary. Pure — no database, no model.
 *   node --import tsx tests/ai-takeover.ts
 */
import { IDLE_MS, whoAnswers, withMe } from "../src/modules/ai-counsellor/services/takeover.service.js";
import { MIGHT_WANT_HUMAN } from "../src/modules/ai-counsellor/lib/handover-detect.js";
import { VisitorNoteSchema, VisitorReplySchema } from "../src/modules/ai-counsellor/schemas/visitor.schema.js";
import { GuestRatingSchema } from "../src/modules/ai-counsellor/schemas/chat.schema.js";
import { buildContactPrompt, parseStaffSummary, pickSummaryChat, summariseConversation, summaryDedupKey } from "../src/modules/ai-counsellor/lib/conversation-summary.js";
import { dueForSummaryQuery } from "../src/modules/ai-counsellor/repositories/visitors.repository.js";
import knexFactory from "knex";
import { handoverRequestEmail } from "../src/shared/mail/templates.js";

let passed = 0;
let failed = 0;
function ok(actual: unknown, expected: unknown, label: string) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed++;
  else { failed++; console.error(`FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}

const now = Date.parse("2026-10-01T12:00:00Z");
const ago = (ms: number) => new Date(now - ms);

/* ── whoAnswers ── */
ok(whoAnswers({}, now).answerer, "ai", "lagging schema (columns absent) → AI");
ok(whoAnswers({ handled_by_user_id: null, handoff_requested_at: null }, now).answerer, "ai", "nobody → AI");
ok(whoAnswers({ handled_by_user_id: 7, handled_at: ago(60_000) }, now), { answerer: "agent", expireHandler: false, expireRequest: false }, "fresh handler answers");
ok(whoAnswers({ handled_by_user_id: 7, handled_at: ago(IDLE_MS) }, now), { answerer: "ai", expireHandler: true, expireRequest: false }, "handler quiet 15 min → AI, expire");
ok(whoAnswers({ handled_by_user_id: 7, handled_at: null }, now).expireHandler, true, "handler with no clock is stale");
ok(whoAnswers({ handoff_requested_at: ago(5 * 60_000) }, now).answerer, "waiting", "fresh request → waiting");
ok(whoAnswers({ handoff_requested_at: ago(IDLE_MS + 1) }, now), { answerer: "ai", expireHandler: false, expireRequest: true }, "nobody joined in 15 min → AI");
ok(whoAnswers({ handled_by_user_id: 7, handled_at: ago(1000), handoff_requested_at: ago(1000) }, now).answerer, "agent", "handler beats request");

/* ── withMe ── */
ok(withMe({ handled_by_user_id: 7 }, 7).handled_by_me, true, "me");
ok(withMe({ handled_by_user_id: 8 }, 7).handled_by_me, false, "not me");
ok(withMe({ handled_by_user_id: null }, 7).handled_by_me, false, "nobody");

/* ── handover prefilter: lets possible requests through, keeps ordinary questions out ── */
for (const m of ["Can I talk to a real person?", "I want to speak to someone", "connect me to an advisor", "is there a human here"]) {
  ok(MIGHT_WANT_HUMAN.test(m), true, `prefilter passes: ${m}`);
}
for (const m of ["What are the fees for the MBA?", "When is the next intake?", "thanks, that's all"]) {
  ok(MIGHT_WANT_HUMAN.test(m), false, `prefilter skips: ${m}`);
}

/* ── request contracts ── */
ok(VisitorReplySchema.safeParse({ body: "  " }).success, false, "empty reply refused");
ok(VisitorReplySchema.safeParse({ body: "", attachments: ["private/x.pdf"] }).success, true, "attachment-only reply allowed");
ok(VisitorReplySchema.safeParse({ body: "hi", role: "assistant" }).success, false, "spoofed role refused (strict)");
ok(VisitorReplySchema.safeParse({ body: "hi", attachments: ["a", "b", "c", "d", "e", "f"] }).success, false, "max 5 attachments");
ok(VisitorNoteSchema.safeParse({ body: "", attachments: ["private/x.pdf"] }).success, true, "a note can be files only");
ok(VisitorNoteSchema.safeParse({ body: "  " }).success, false, "an empty note is refused");
ok(VisitorNoteSchema.safeParse({ body: "hi", attachments: ["a", "b", "c", "d", "e", "f"] }).success, false, "a note takes at most 5 files");
const fp = { embed_key: "4b0d0e0a-1c2d-4e5f-8a9b-0c1d2e3f4a5b", fingerprint: "f" };
ok(GuestRatingSchema.safeParse({ ...fp, rating: 0 }).success, false, "rating below 1 refused");
ok(GuestRatingSchema.safeParse({ ...fp, rating: 6 }).success, false, "rating above 5 refused");
ok(GuestRatingSchema.safeParse({ ...fp, rating: 2, comment: "x".repeat(1001) }).success, false, "comment capped");
ok(GuestRatingSchema.safeParse({ ...fp, rating: 5 }).success, true, "rating without comment");

/* ── summary: staff answers are labelled, never passed off as the AI's ── */
const { turns } = summariseConversation([
  { role: "user", content: "Can someone check my transcript?" },
  { role: "agent", content: "Yes, send it over.", sender_name: "Alex Morgan" },
]);
ok(turns, [{ question: "Can someone check my transcript?", answer: "Alex Morgan (admissions team): Yes, send it over." }], "agent turn labelled");

/* ── visitor-page summary: first after a quiet spell, then at most daily and only with new activity ── */
const sql = dueForSummaryQuery(knexFactory({ client: "pg" }), { limit: 10 }).toString();
ok(sql.includes(`"message_count" >= 2`), true, "needs a real exchange");
ok(sql.includes(`"summary" is null`), true, "backfill: visitors with no contact summary yet");
ok(sql.includes(`summary->>'kind' IS NULL`), true, "backfill: an old per-visitor chat summary is rewritten once as a contact summary");
ok(/interval|make_interval/.test(sql), false, "no cooldown: everything else updates as it happens");
ok(/\$\d/.test(sql.replace(/limit \d+/, "")), false, "no stray bindings in the raw SQL");

/* ── staff summary JSON: bounded, cleaned, and null when unusable (the old summary then stays) ── */
ok(parseStaffSummary('{"title":"Scholarships for the MEng","brief":"Backend developer with **IELTS 7.0**.","open":["Fees","Application"],"next_step":"Share funding guidance."}'),
  { title: "Scholarships for the MEng", brief: "Backend developer with **IELTS 7.0**.", open: ["Fees", "Application"], next_step: "Share funding guidance." }, "parses the four parts");
ok(parseStaffSummary('```json\n{"brief":"x","open":[],"next_step":""}\n```'), { title: null, brief: "x", open: [], next_step: null }, "code fence, no title, empty next step");
ok(parseStaffSummary("Here is a summary of the chat."), null, "prose is unusable");
ok(parseStaffSummary('{"brief":"","open":["Fees"]}'), null, "no brief is unusable");
ok(parseStaffSummary('{"brief":"x","open":["a","b","c","d","e",3]}')?.open, ["a", "b", "c", "d"], "at most four open topics, strings only");

/* ── "a visitor is waiting" email ── */
const mail = handoverRequestEmail({ orgName: "Northfield University", visitorName: "Priya", message: "<b>connect me</b> to a person", inboxUrl: "https://app.test/business/messages?visitor=7" });
ok(mail.subject, "Priya is waiting for a person on your website chat", "subject names the visitor");
ok(mail.html.includes("&lt;b&gt;connect me&lt;/b&gt;"), true, "the visitor's words are escaped");
ok(mail.html.includes("<b>connect me</b>"), false, "and never injected as markup");
ok(mail.html.includes("https://app.test/business/messages?visitor=7"), true, "the button opens that visitor's chat");
ok(mail.html.includes("Reply to Priya"), true, "the button replies to the visitor by first name");
ok(mail.html.includes("Waiting now"), true, "the waiting badge is shown");
ok(handoverRequestEmail({ orgName: null, visitorName: null, message: "hi", inboxUrl: "x" }).html.includes("Open the conversation"), true, "anonymous visitor gets a neutral button");
ok(handoverRequestEmail({ orgName: null, visitorName: null, message: "hi", inboxUrl: "x" }).subject, "A visitor is waiting for a person on your website chat", "anonymous visitor");

/* ── per-chat: one email per chat, and the contact summary reads chat summaries, not transcripts ── */
ok(summaryDedupKey("t1", 7, 41) === summaryDedupKey("t1", 7, 42), false, "a second chat gets its own summary email");
ok(summaryDedupKey("t1", 7, 41), "chat_summary:t1:7:41", "dedup key carries the chat");
const contactPrompt = buildContactPrompt({
  profile: { name: "Sarah Lee", nationality: "Nepal", age: null, qualifications: [] },
  chats: [
    { title: "Entry requirements for the MEng", started: "2026-10-01", ended: true, text: "Asked about entry requirements." },
    { title: null, started: "2026-10-02", ended: false, text: "Asked about scholarships." },
  ],
});
ok(contactPrompt.includes("- nationality: Nepal"), true, "profile facts that are set go in");
ok(contactPrompt.includes("age"), false, "unset profile fields are left out");
ok(contactPrompt.includes("Chat 1 (2026-10-01, ended) — Entry requirements for the MEng"), true, "each chat in order, with its title");
ok(contactPrompt.includes("Chat 2 (2026-10-02, in progress):"), true, "an untitled open chat");

/* ── which chat a summary email is for ── */
const chatsSeen = [
  { id: 41, ended_at: "2026-10-01T10:35:00Z" },
  { id: 42, ended_at: "2026-10-02T14:44:00Z" },
  { id: 43, ended_at: null },
];
ok(pickSummaryChat(chatsSeen, "2026-10-01T11:05:00Z", 43), 42, "a message after ending: still emails the chat that ended, not the new one");
ok(pickSummaryChat(chatsSeen, "2026-10-02T15:00:00Z", 43), 43, "nothing ended since the last email: the current chat (quiet fallback)");
ok(pickSummaryChat(chatsSeen, null, 43), 42, "never emailed: the most recent ended chat");
ok(pickSummaryChat([], null, 7), 7, "no chats on record (adopted or pre-migration): the visitor's session");

console.log(`ai-takeover: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
