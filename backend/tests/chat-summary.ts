/**
 * The two pieces of the widget contact-capture flow with enough branches to get quietly wrong:
 * WHEN the counsellor asks for contact details, and WHAT ends up in the summary email.
 *
 * Pure — no database, no model, no mail. Run it directly:
 *   node --import tsx tests/chat-summary.ts
 */
import {
  shouldPrompt, decidePrompt, shouldDetectConclusion,
} from "../src/modules/ai-counsellor/services/visitor.service.js";
import { cleanProfile, parseBlocks, parseConclusion, parseProfile, stripBlocks } from "../src/modules/ai-counsellor/lib/card-parser.js";
import { worthExtracting } from "../src/modules/ai-counsellor/lib/profile-extract.js";
import { recordProfile, recordTurn } from "../src/modules/ai-counsellor/services/visitor.service.js";
import {
  summariseConversation, buildSummaryPrompt, worthSummarising, looksTruncated,
  trimToCompleteSentence, MAX_TURNS,
} from "../src/modules/ai-counsellor/lib/conversation-summary.js";
import { chatSummaryEmail } from "../src/shared/mail/templates.js";

let passed = 0;
let failed = 0;

function ok(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) passed++;
  else { failed++; console.error(`FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}

function deep(actual: unknown, expected: unknown, label: string) {
  ok(JSON.stringify(actual), JSON.stringify(expected), label);
}

/* ── shouldPrompt: a spread, not a fixed message number ── */

// The schedule is randomised per the product ask — first ask around messages 3-5, then 5-10
// further messages after a decline — but derived from the visitor's key rather than
// Math.random(). So these assert the CONTRACT over a sample of visitors (bounds, variation,
// stability) rather than one key's answer, which would bake the hash function into the test.
const KEYS = Array.from({ length: 60 }, (_, i) => `f4c1${(i * 7919).toString(16)}visitor${i}`);

type ContactRow = Parameters<typeof shouldPrompt>[0];
const contactRow = (key: string, over: Partial<ContactRow> = {}): ContactRow => ({
  visitor_key: key,
  contact_status: "not_shown",
  contact_prompted_at_count: null,
  contact_prompt_count: 0,
  ...over,
});

/** The first message count at which this visitor would be asked, or -1 within 40 messages. */
const firstAsk = (key: string): number => {
  for (let n = 1; n <= 40; n++) if (shouldPrompt(contactRow(key), n)) return n;
  return -1;
};

const firsts = KEYS.map(firstAsk);
ok(Math.min(...firsts) >= 3, true, "nobody is asked for their details before message 3");
ok(Math.max(...firsts) <= 5, true, "everybody is asked by message 5");
ok(new Set(firsts).size > 1, true, "the first-ask threshold actually varies between visitors");

// THE DETERMINISM REGRESSION, and the reason the spread is hashed rather than rolled. Swap in
// Math.random() and this set grows: the card falls due at 4 on one turn and 5 on the next, so
// whether it ever appears depends on which turn happens to roll low. A visitor's schedule has
// to be fixed for the life of their row.
ok(new Set(Array.from({ length: 50 }, () => firstAsk(KEYS[0]))).size, 1,
  "one visitor's threshold never moves between calls");

// A visitor who gave their details is never asked again — the single hardest rule in the brief.
const submitted = contactRow(KEYS[0], { contact_status: "submitted", contact_prompted_at_count: 3 });
ok(shouldPrompt(submitted, 4), false, "never re-asks after a submission");
ok(shouldPrompt(submitted, 99), false, "never re-asks after a submission, however long the chat");

/** How many messages after a decline at message 10 before this visitor is asked again. */
const gapAfterDecline = (key: string, round: number, status: "skipped" | "shown" = "skipped"): number => {
  const v = contactRow(key, { contact_status: status, contact_prompted_at_count: 10, contact_prompt_count: round });
  for (let n = 11; n <= 60; n++) if (shouldPrompt(v, n)) return n - 10;
  return -1;
};

const gaps = KEYS.map((k) => gapAfterDecline(k, 1));
ok(Math.min(...gaps) >= 5, true, "nobody is re-asked within 5 messages of declining");
ok(Math.max(...gaps) <= 10, true, "everybody is re-asked within 10 messages of declining");
ok(new Set(gaps).size > 1, true, "the re-ask gap varies between visitors");

// Each successive ask is its own draw, so one visitor is not stuck with the same gap forever.
ok(new Set([1, 2, 3, 4, 5, 6].map((r) => gapAfterDecline(KEYS[0], r))).size > 1, true,
  "successive asks for one visitor do not all reuse a single gap");

// A card shown and ignored counts the same as one actively dismissed — otherwise ignoring it
// would re-trigger the ask on the very next message.
ok(gapAfterDecline(KEYS[0], 1, "shown"), gapAfterDecline(KEYS[0], 1, "skipped"),
  "an ignored card buys exactly the same gap as a dismissed one");

/* ── summariseConversation ── */

const cardA = { name: "MSc Data Science", institution: "Acme University" };
const cardB = { name: "MSc Data Science", institution: "Other University" };

const convo = summariseConversation([
  { role: "assistant", content: "Hi! How can I help?" },
  { role: "user", content: "Do you offer data science?" },
  { role: "assistant", content: "Yes, we do.", cards: [cardA] },
  { role: "user", content: "What does it cost?" },
  { role: "assistant", content: "AUD 42,000 a year.", cards: [cardA, cardB] },
]);

deep(convo.turns.map((t) => t.question), ["Do you offer data science?", "What does it cost?"], "pairs each question with its answer");
ok(convo.turns[0].answer, "Yes, we do.", "the answer is the assistant message that followed");
ok(convo.turns.length, 2, "an opening greeting with no question before it is not a turn");

// The dedupe that makes the course list readable rather than one entry per mention.
ok(convo.courses.length, 2, "the same course shown twice appears once");
deep(convo.courses, ["MSc Data Science — Acme University", "MSc Data Science — Other University"], "same course name at two institutions stays two entries");

ok(
  summariseConversation([{ role: "assistant", content: "Hi!", cards: [{ institution: "Acme" }] }]).courses.length,
  0,
  "a card with no course name is skipped rather than listed blank",
);

ok(
  summariseConversation([{ role: "user", content: "Anyone there?" }]).turns.length,
  0,
  "a question with no answer yet is not a turn",
);

// Two questions before an answer: the answer addresses the later one.
const doubled = summariseConversation([
  { role: "user", content: "First?" },
  { role: "user", content: "Actually, second?" },
  { role: "assistant", content: "Answering the second." },
]);
ok(doubled.turns.length, 1, "a double-sent question makes one turn, not two");
ok(doubled.turns[0].question, "Actually, second?", "the later question is the one the answer is paired with");

// A very long chat is trimmed to the recent tail, but its courses are not.
const long = summariseConversation(
  Array.from({ length: 60 }, (_, i) => [
    { role: "user", content: `Q${i}` },
    { role: "assistant", content: `A${i}`, cards: i === 0 ? [cardA] : [] },
  ]).flat(),
);
ok(long.turns.length, MAX_TURNS, "the transcript is capped");
ok(long.turns[0].question, "Q20", "the cap keeps the most recent exchanges");
ok(long.courses.length, 1, "a course mentioned before the cap still reaches the email");

ok(summariseConversation([]).turns.length, 0, "an empty conversation summarises to nothing");

/* ── summary prompt + the recap/transcript fallback ── */

function has(haystack: string, needle: string, label: string) {
  if (haystack.includes(needle)) passed++;
  else { failed++; console.error(`FAIL ${label}: expected to find ${JSON.stringify(needle)}`); }
}
function lacks(haystack: string, needle: string, label: string) {
  if (!haystack.includes(needle)) passed++;
  else { failed++; console.error(`FAIL ${label}: did NOT expect ${JSON.stringify(needle)}`); }
}

// One exchange is not worth a model call — the recap would be longer than the chat.
ok(worthSummarising({ turns: [{ question: "Q", answer: "A" }], courses: [] }), false, "a single exchange is not worth summarising");
ok(worthSummarising(convo), true, "a real conversation is worth summarising");
ok(worthSummarising({ turns: [], courses: [] }), false, "an empty conversation is not worth summarising");

const prompt = buildSummaryPrompt(convo, "Acme University");
has(prompt.prompt, "Acme University", "the prompt names the institution");
has(prompt.prompt, "Do you offer data science?", "the prompt carries the student's questions");
has(prompt.prompt, "MSc Data Science — Acme University", "the prompt lists the courses that were shown");
has(prompt.system, "Never invent", "the system prompt forbids inventing facts");
has(prompt.system, "WHOLE conversation", "the system prompt asks for the whole chat, not just the courses");
has(prompt.system, "do not just re-list them", "the system prompt stops the recap duplicating the course block");
has(prompt.system, "Finish every sentence", "the system prompt asks for complete sentences");

// The exact failure the first real email hit: a thinking model's reasoning ate the output
// budget and the recap was mailed stopping mid-phrase.
ok(looksTruncated("We introduced two options: the on-campus Master"), true, "a recap stopping mid-phrase is caught");
ok(looksTruncated("You asked about data science. We covered fees and intakes."), false, "a finished recap passes");
ok(looksTruncated("Did we cover everything?"), false, "ending on a question mark is finished");
ok(looksTruncated('She said \"yes\"'), false, "ending on a closing quote is finished");
// The recap is a bullet list now, so every recap ends on a bullet. Exempting bullets from the
// check — as this used to — would have left the truncation guard permanently off. The prompt
// requires a full stop on every bullet so the ordinary punctuation check covers them.
ok(looksTruncated("Next steps:\n\n- Check the entry requirements."), false, "a bullet closed with a full stop is finished");
ok(looksTruncated("- The course runs 39 weeks.\n- It costs USD 8,"), true, "a recap clipped mid-bullet is caught, not mailed as complete");
// Over MIN_SALVAGE_CHARS (120) on purpose — below it, salvage correctly returns "" and the
// email falls back to the transcript instead of mailing two lonely bullets.
ok(
  trimToCompleteSentence("- You asked about the Master of Engineering in Computer Science.\n- The certificate runs 39 weeks and costs USD 8,400 in tuition.\n- Tuition drops to USD 5,"),
  "- You asked about the Master of Engineering in Computer Science.\n- The certificate runs 39 weeks and costs USD 8,400 in tuition.",
  "salvage drops the clipped bullet and keeps the whole ones",
);
ok(looksTruncated("   "), true, "an empty recap counts as truncated");
ok(looksTruncated("The fee is USD 8,400 total"), true, "a sentence with no terminator is caught");

// Salvage: a clipped recap is worth more to the visitor than the raw Q&A, so cut back to the
// last finished sentence rather than throwing the whole thing away. This is the real tail the
// worker logged on 2026-09-17.
const clipped = "You asked about postgraduate options at Cornell. We went through the two graduate programs, their intakes and the fee for each, and what the application timeline looks like. You also asked about the admission requirements for the graduate Computer Science programs, and we covered that";
const rescued = trimToCompleteSentence(clipped);
has(rescued, "what the application timeline looks like.", "salvage keeps the complete sentences");
lacks(rescued, "and we covered that", "salvage drops the clipped tail");
ok(looksTruncated(rescued), false, "what salvage returns is itself complete");

ok(trimToCompleteSentence("You asked about fees. We covered them."), "You asked about fees. We covered them.", "a complete recap passes through untouched");
ok(trimToCompleteSentence("We introduced two options: the on-campus Master"), "", "nothing whole left means fall back to the transcript");
ok(trimToCompleteSentence("Yes. And then"), "", "a salvage too thin to be worth sending is rejected");
ok(trimToCompleteSentence("   "), "", "an empty recap salvages to nothing");
lacks(buildSummaryPrompt(convo, null).prompt, "undefined", "a missing institution name leaves no 'undefined' in the prompt");

const mailArgs = { name: "Sarah", orgName: "Acme University", courses: convo.courses, turns: convo.turns, conversationUrl: "https://example.test/embed/k" };

// With a recap: the recap is the email, and the raw Q&A stays out of it.
const withSummary = chatSummaryEmail({ ...mailArgs, summary: "You asked about data science.\n\n- Check the entry requirements" });
has(withSummary.html, "You asked about data science.", "the recap is rendered when present");
has(withSummary.html, "Check the entry requirements", "recap bullets are rendered");

// The recap is now an opening line followed straight by bullets. Grouping by BLOCK (every line
// between two blank lines had to be a bullet) flattened exactly that shape into one run-on
// paragraph whenever the model omitted the blank line — which is not something a prompt can
// guarantee. Runs of consecutive lines are what make the blank line irrelevant.
const runOn = chatSummaryEmail({
  ...mailArgs,
  summary: "You were looking at postgraduate computing.\n- The course runs 39 weeks.\n- Tuition is USD 8,400.",
});
// `&bull;`, not `<table` — the course list is a table too, so a table assertion would pass
// against the very renderer this is meant to catch.
has(runOn.html, "&bull;", "bullets following an opening line with no blank line still render as a list");
lacks(runOn.html, "postgraduate computing. - The course runs", "the opening line is not glued to the bullets as one paragraph");
lacks(withSummary.html, "What does it cost?", "the transcript is NOT included alongside a recap");
has(withSummary.text, "You asked about data science.", "the plain-text part carries the recap too");

// Without one: the transcript is the fallback, so the visitor always gets something.
const noSummary = chatSummaryEmail({ ...mailArgs, summary: null });
has(noSummary.html, "What does it cost?", "the transcript is the fallback when the recap is null");
const blankSummary = chatSummaryEmail({ ...mailArgs, summary: "   " });
has(blankSummary.html, "What does it cost?", "a blank recap falls back to the transcript too");

// Model text is escaped — it is built from a stranger's chat and lands in someone's inbox.
const nasty = chatSummaryEmail({ ...mailArgs, summary: "<script>alert(1)</script>" });
lacks(nasty.html, "<script>", "model output is escaped, not injected as markup");
has(nasty.html, "&lt;script&gt;", "model output is escaped as entities");

has(chatSummaryEmail({ ...mailArgs, summary: "Recap." }).html, "Acme University", "the institution is still named with a recap");

/* ── the plain-text part tells the same story as the HTML ── */

// THE PRE-EXISTING BUG. The HTML has always branched recap-vs-transcript; the text part
// announced "a recap" over a raw transcript whenever the model was unavailable. Half of
// "don't claim something the email doesn't contain" was being violated on every fallback.
lacks(noSummary.text, "recap", "the transcript fallback does not call itself a recap in the plain-text part");
has(noSummary.text, "the conversation you had", "the plain-text part describes what it actually contains");
has(withSummary.text, "recap", "a real recap is still announced as one");

/* ── confirmed goodbye vs abandoned tab ── */

const PICK_UP = "pick up where you left off";

// Unconfirmed is the default, including for rows queued before `confirmed_end` existed:
// the invitation is harmless to someone who was finished, where asserting their question
// went unanswered would be false for every satisfied visitor who just closed the tab.
const abandoned = chatSummaryEmail({ ...mailArgs, summary: "Recap." });
has(abandoned.html, PICK_UP, "an unconfirmed ending invites the visitor back");
has(abandoned.text, PICK_UP, "the invitation reaches the plain-text part too");
lacks(abandoned.html, "resolved", "an unconfirmed ending claims nothing about resolution");
lacks(abandoned.text, "resolved", "the plain-text part claims nothing about resolution either");

// Zero regression: a visitor who pressed "End chat & send summary" gets exactly today's email.
const confirmed = chatSummaryEmail({ ...mailArgs, summary: "Recap.", confirmedEnd: true });
lacks(confirmed.html, PICK_UP, "a confirmed ending is not invited back — they said they were done");
lacks(confirmed.text, PICK_UP, "nor in the plain-text part");
has(confirmed.html, "Here's a recap of your chat", "a confirmed ending keeps today's opening line");

/* ── the conclusion marker: parsed, and NEVER visible ── */

const fence = (body: string) => "```block\n" + body + "\n```";
const HIGH = fence('{"type":"conclusion","completion_likelihood":"high","reason":"all three questions answered, no open threads","covered":"we covered the fees and the intake"}');
const answer = `Here is what I found.\n\n${HIGH}\n\nAnything else?`;

deep(parseConclusion(answer), { likelihood: "high", reason: "all three questions answered, no open threads", covered: "we covered the fees and the intake" }, "the whole signal is extracted");
ok(parseConclusion("Nothing structured here."), null, "no marker means no signal");

// THE LEAK REGRESSION. A marker that survives stripBlocks is persisted as the assistant
// message, replayed into the next turn's history, and reproduced in the summary email — and
// with a bespoke fence tag it would also render on screen mid-stream. This assertion is the
// whole reason the type rides the `block` fence and has a VALIDATORS entry.
lacks(stripBlocks(answer), "conclusion", "the marker is stripped from the visible answer");
lacks(stripBlocks(answer), "```", "no fence survives into the visible answer");
lacks(stripBlocks(answer), "no open threads", "the internal reason never reaches the visitor");
has(stripBlocks(answer), "Here is what I found.", "the prose around it is untouched");

// It must never reach the client as a renderable block either.
ok(parseBlocks(answer).length, 0, "the conclusion is not handed to the client as a block");
ok(
  parseBlocks(`${fence('{"type":"timeline","steps":[{"title":"Apply"}]}')}\n${HIGH}`).length,
  1,
  "a real block alongside it still comes through",
);

// The graded signal: only "high" is actionable, but medium must still parse so it can be
// logged — a run of mediums is how an over-shy instruction shows itself.
const MEDIUM = fence('{"type":"conclusion","completion_likelihood":"medium","reason":"fees answered but they never said what level they are applying at"}');
ok(parseConclusion(MEDIUM)?.likelihood, "medium", "a medium signal parses");
ok(parseConclusion(MEDIUM)?.covered, null, "medium needs no visitor-facing clause");
ok(parseConclusion(fence('{"type":"conclusion","completion_likelihood":"low","reason":"just getting started"}'))?.likelihood, "low", "a low signal parses");

// Bounds and shape, because one of these fields is shown to the visitor.
ok(parseConclusion(fence('{"type":"conclusion","reason":"x"}')), null, "a signal with no likelihood is rejected");
ok(parseConclusion(fence('{"type":"conclusion","completion_likelihood":"very high","reason":"x"}')), null, "an off-enum likelihood is rejected");
ok(parseConclusion(fence('{"type":"conclusion","completion_likelihood":"high"}')), null, "a signal with no reason is rejected");
// An oversized visitor-facing clause costs the CLAUSE, not the judgement. Truncating it would
// put a half-sentence on the card; rejecting the whole signal would lose a sound judgement over
// one optional display field. The card renders without `covered` already.
deep(
  parseConclusion(fence(`{"type":"conclusion","completion_likelihood":"high","reason":"x","covered":"${"y".repeat(201)}"}`)),
  { likelihood: "high", reason: "x", covered: null },
  "an oversized visitor-facing clause is dropped, the judgement survives",
);
deep(
  parseConclusion(fence(`{"type":"conclusion","completion_likelihood":"high","reason":"x","covered":"${"y".repeat(200)}"}`)),
  { likelihood: "high", reason: "x", covered: "y".repeat(200) },
  "a clause exactly at the limit is kept whole",
);

/* ── decidePrompt: the two offers, arbitrated ── */

const withEmail = {
  visitor_key: KEYS[0],
  contact_status: "submitted" as const, contact_prompted_at_count: 3, contact_prompt_count: 1,
  email: "a@b.com", conversation_state: "active" as const,
  end_prompt_count: 0, summary_status: null,
};

ok(decidePrompt(withEmail, 5, true), "ending", "offers to end when the counsellor says so");
ok(decidePrompt(withEmail, 5, false), null, "stays quiet without a conclusion signal — no message count triggers this");

// Offered once, and that is the entire rule. The message-gap cooldown this replaced existed
// because declining used to cost the visitor their summary; the 30-minute fallback now sends one
// to everyone who gave an address, so there is nothing left to keep re-offering.
const declined = { ...withEmail, conversation_state: "continue" as const, end_prompt_count: 1 };
ok(decidePrompt(declined, 8, true), null, "never re-offers to a visitor who already declined once");
ok(decidePrompt(declined, 99, true), null, "and not after any number of further messages either");

// Already ended, or a summary already owed.
ok(decidePrompt({ ...withEmail, conversation_state: "end_confirmed" }, 9, true), null, "never re-offers after the visitor ended the chat");
// `pending` means the summary is OWED (set when they gave their address), not sent — and
// confirming is how they get it now instead of in an hour. Silencing the offer here would
// silence it for every visitor who ever handed over an email, which is all of them.
ok(decidePrompt({ ...withEmail, summary_status: "pending" }, 9, true), "ending", "still offers while a summary is merely owed — confirming is how they get it sooner");
ok(decidePrompt({ ...withEmail, summary_status: "processing" }, 9, true), null, "never offers while a summary is being sent");
ok(decidePrompt({ ...withEmail, summary_status: "sent" }, 9, true), null, "never offers once a summary has been sent");

// No address yet: a conclusion is the best moment to ask for one, ahead of the message count.
const noEmail = {
  visitor_key: KEYS[0],
  contact_status: "not_shown" as const, contact_prompted_at_count: null, contact_prompt_count: 0,
  email: null, conversation_state: "active" as const,
  end_prompt_count: 0, summary_status: null,
};
ok(decidePrompt(noEmail, 1, true), "contact", "a conclusion brings the contact card forward past the threshold");
ok(decidePrompt(noEmail, 1, false), null, "without a conclusion the count rule still governs");
ok(decidePrompt(noEmail, firstAsk(KEYS[0]), false), "contact", "the count rule still fires at this visitor" + "\u2019s own threshold");
ok(decidePrompt({ ...noEmail, contact_prompted_at_count: 2 }, 4, true), null, "a conclusion does not override a fresh contact decline");

/* ── the gate and the decision must agree ──
 *
 * The bug this exists for: the gate ALSO required an email, so a visitor without one was never
 * asked for a conclusion signal, so `concluded` was always false for them, so decidePrompt's
 * "concluded but no address yet" branch was dead in production. Every direct-call test of that
 * branch passed regardless, because they supply `concluded: true` themselves.
 *
 * The invariant, asserted as a property over the whole state space rather than case by case:
 * if decidePrompt can act on a conclusion, the gate must have asked for one.
 */
const states = ["active", "ending_prompt_shown", "continue", "end_confirmed"] as const;
const summaries = [null, "pending", "processing", "sent", "failed"] as const;
const contacts = ["not_shown", "shown", "skipped", "submitted"] as const;

let violations = 0;
for (const conversation_state of states) {
  for (const summary_status of summaries) {
    for (const contact_status of contacts) {
      for (const email of [null, "a@b.com"]) {
        for (const end_prompt_count of [0, 1]) {
          for (const contact_prompted_at_count of [null, 3]) {
            // Both an early turn and a late one. At a high count the count rule returns
            // "contact" anyway, so a low count is what makes the difference visible.
            for (const n of [1, 20]) {
            const v = { visitor_key: KEYS[0], contact_prompt_count: 1, conversation_state, summary_status, contact_status, email, end_prompt_count, contact_prompted_at_count };
            // When the gate never asked for a signal, `concluded` cannot be anything but
            // false in production — so the decision must not depend on it. Anywhere it does,
            // that behaviour is unreachable code pretending to be a feature.
            if (!shouldDetectConclusion(v)
                && decidePrompt(v, n, true) !== decidePrompt(v, n, false)) {
              violations++;
            }
            }
          }
        }
      }
    }
  }
}
ok(violations, 0, "with the gate shut, decidePrompt ignores `concluded` entirely — no unreachable behaviour");

// And the gate is not so wide that it asks pointlessly.
ok(shouldDetectConclusion({ summary_status: null, conversation_state: "active" }), true, "the gate is open for an active conversation");
ok(shouldDetectConclusion({ summary_status: null, conversation_state: "continue" }), true, "the gate reopens after a visitor chose to continue");
ok(shouldDetectConclusion({ summary_status: "pending", conversation_state: "active" }), true, "the gate stays open while a summary is only owed");
ok(shouldDetectConclusion({ summary_status: "processing", conversation_state: "active" }), false, "the gate shuts once a summary is being sent");
ok(shouldDetectConclusion({ summary_status: "sent", conversation_state: "active" }), false, "the gate shuts once a summary has been sent");

// An un-migrated tenant schema returns rows with the column ABSENT, so these read as undefined
// rather than null. A strict `!== null` check treated that as "already sent" and silently
// disabled the whole feature — no offer, no error, nothing in the log to explain it.
ok(shouldDetectConclusion({ summary_status: undefined, conversation_state: "active" } as never), true, "an absent summary_status does not read as settled");
ok(decidePrompt({ ...withEmail, summary_status: undefined } as never, 9, true), "ending", "an absent summary_status still allows the offer");
// Same hazard, second column: a strict `end_prompt_count === 0` reads an absent column as
// "already offered" and silently disables the card. Unknown must fail towards offering.
ok(decidePrompt({ ...withEmail, end_prompt_count: undefined } as never, 9, true), "ending", "an absent end_prompt_count reads as never-offered, not as already-offered");
ok(shouldDetectConclusion({ summary_status: null, conversation_state: "end_confirmed" }), false, "the gate is shut once the visitor ended the chat");

// The branch that was dead: no email, a conclusion, and the contact card comes forward.
ok(shouldDetectConclusion(noEmail), true, "a visitor with no email is still asked for a conclusion signal");


/* ── the profile block: cleaned, never visible ── */

const PROFILE = fence(JSON.stringify({
  type: "profile",
  qualifications: [{ degree_title: "BSc Computing", grade_value: "2:1", institution_name: "Leeds" }],
  language_tests: [{ test_type: "IELTS", overall_score: "7.0", sub_scores: { writing: "6.5" } }],
}));
const withProfile = `Here is what I found.\n\n${PROFILE}\n\nAnything else?`;

deep(parseProfile(withProfile), {
  qualifications: [{ degree_title: "BSc Computing", grade_value: "2:1", institution_name: "Leeds" }],
  language_tests: [{ test_type: "IELTS", overall_score: "7.0", sub_scores: { writing: "6.5" } }],
}, "the arrays the turn revealed are extracted");
ok(parseProfile("Nothing structured here."), null, "no block means no profile");

// THE LEAK REGRESSION, same as the conclusion marker: a block that survives stripBlocks is
// persisted as the assistant message and read back to the visitor as their own data in JSON.
lacks(stripBlocks(withProfile), "qualifications", "the profile block is stripped from the visible answer");
lacks(stripBlocks(withProfile), "```", "and leaves no orphan fence behind");
ok(parseBlocks(withProfile).length, 0, "it never reaches the client as a renderable block");

// Model output going into a database column: unknown keys dropped, values bounded, junk rejected.
const dirty = fence(JSON.stringify({
  type: "profile",
  qualifications: [{ degree_title: "BSc", confidence: 0.8, notes: "x".repeat(500) }],
  work_experiences: [{}],
  invented_array: [{ anything: "at all" }],
}));
const cleaned = parseProfile(dirty);
deep(cleaned, { qualifications: [{ degree_title: "BSc" }] }, "unknown fields, unknown arrays and empty entries are all dropped");

// A number where a score was expected is the model being helpful — the platform_user_* columns
// are text, so it is coerced rather than discarded.
deep(parseProfile(fence(JSON.stringify({ type: "profile", academic_tests: [{ test_type: "GRE", overall_score: 320 }] }))),
  { academic_tests: [{ test_type: "GRE", overall_score: "320" }] }, "a numeric score is coerced to text, not dropped");

// Four empty arrays must NOT validate. It would strip cleanly from the prose and write nothing —
// the worst outcome, because it looks like it worked.
ok(parseProfile(fence(JSON.stringify({ type: "profile", qualifications: [], language_tests: [] }))), null,
  "a block with nothing in it is not a profile");

/* ── recordProfile: merges across turns, never duplicates ── */

/**
 * Enough fake knex for recordProfile: it reads the four columns under a row lock, then updates
 * them. Captures the patch so the merge can be asserted without a database — the real one is
 * unreachable from here.
 *
 * `forUpdate` and `transaction` are asserted, not just stubbed: the merge is a read-modify-write
 * over whole jsonb arrays, so losing either one silently reintroduces the race where two
 * concurrent turns each drop the other's captured fact.
 */
function fakeDb(row: Record<string, unknown>) {
  const captured: Record<string, unknown> = {};
  const seen = { locked: false, inTransaction: false };
  // One callable stands in for both the knex instance and the trx handed to the callback: real
  // code calls each the same way, `db(TABLE)` / `trx(TABLE)`.
  const builder = (_table?: string) => ({
    where: () => ({
      forUpdate: () => ({ first: async () => { seen.locked = true; return row; } }),
      first: async () => row,
      update: async (patch: Record<string, unknown>) => { Object.assign(captured, patch); },
    }),
  });
  builder.fn = { now: () => "NOW()" };
  // Raw fragments are captured as their SQL text so a test can tell "wrote the number the route
  // computed" from "told Postgres to increment" — the whole point of the concurrency fix.
  builder.raw = (sql: string) => ({ __raw: sql });
  builder.transaction = async (cb: (t: unknown) => Promise<void>) => {
    seen.inTransaction = true;
    await cb(builder);
  };
  return { db: builder as never as Parameters<typeof recordProfile>[0], captured, seen };
}

const parsed = (p: Record<string, unknown>) => JSON.parse(p as unknown as string) as unknown[];

// First mention on an empty row.
{
  const { db, captured, seen } = fakeDb({ qualifications: null, language_tests: null, academic_tests: null, work_experiences: null });
  await recordProfile(db, 1, { language_tests: [{ test_type: "IELTS", overall_score: "7.0" }] });
  deep(parsed(captured.language_tests as never), [{ test_type: "IELTS", overall_score: "7.0" }], "a first mention is written as a one-entry array");
  ok(captured.qualifications, undefined, "columns the turn said nothing about are left alone");
  ok(seen.inTransaction, true, "the merge runs inside a transaction");
  ok(seen.locked, true, "the read that feeds the merge takes a row lock");
}

// THE ONE THAT MATTERS: restating the same test later fills in detail instead of duplicating.
{
  const { db, captured } = fakeDb({ language_tests: [{ test_type: "IELTS", overall_score: "7.0" }] });
  await recordProfile(db, 1, { language_tests: [{ test_type: "IELTS", test_date: "2025-06" }] });
  deep(parsed(captured.language_tests as never), [{ test_type: "IELTS", overall_score: "7.0", test_date: "2025-06" }],
    "restating a test merges into the existing entry rather than adding a second");
}

// A genuinely different test is a second entry, not a merge.
{
  const { db, captured } = fakeDb({ language_tests: [{ test_type: "IELTS", overall_score: "7.0" }] });
  await recordProfile(db, 1, { language_tests: [{ test_type: "PTE", overall_score: "65" }] });
  ok(parsed(captured.language_tests as never).length, 2, "a different test type is added alongside, not merged over");
}

// Two degrees from the same university are two qualifications — the key is title AND institution.
{
  const { db, captured } = fakeDb({ qualifications: [{ degree_title: "BSc Computing", institution_name: "Leeds" }] });
  await recordProfile(db, 1, { qualifications: [{ degree_title: "MSc Data Science", institution_name: "Leeds" }] });
  ok(parsed(captured.qualifications as never).length, 2, "a second degree at the same institution is a second entry");
}

// A lagging schema returns the column ABSENT. The merge must treat that as empty, not throw.
{
  const { db, captured } = fakeDb({});
  await recordProfile(db, 1, { work_experiences: [{ job_title: "Engineer" }] });
  deep(parsed(captured.work_experiences as never), [{ job_title: "Engineer" }], "an absent column merges as empty rather than throwing");
}

// Nothing to add means no write at all — an empty UPDATE would still bump updated_at and make
// every turn look like it captured something.
{
  const { db, captured } = fakeDb({ language_tests: [{ test_type: "IELTS" }] });
  await recordProfile(db, 1, {});
  ok(Object.keys(captured).length, 0, "an empty profile writes nothing");
}

// ── Profile extraction: the prefilter ──
// This decides whether a turn is looked at AT ALL. A message it rejects is never revisited, so a
// false negative loses that fact permanently — which is why the bar here is deliberately low.
for (const msg of [
  "I have done bachelors in computing with an upper second class degree and i have got 7 in ielts",
  "7 in ielts 7 in writing 7 in speaking 7 reading and 7 in listening",
  "my GPA was 3.6",
  "I worked as a junior developer for two years",
  "I'm planning to take the PTE next month",
  "Graduated last year with a diploma",
  "gre 320",
]) ok(worthExtracting(msg), true, `prefilter accepts: ${msg.slice(0, 40)}`);

for (const msg of [
  "What are the tuition fees?",
  "Tell me about application deadlines",
  "ok",
  "yes",
  "thanks!",
  "Which campus is it on?",
]) ok(worthExtracting(msg), false, `prefilter skips: ${msg}`);

// ── Profile extraction: every sub-score survives ──
// The reported failure was a student listing an overall band plus four components and none of it
// landing. cleanProfile is the last gate before the jsonb column, so it is asserted directly
// rather than through a model call this suite cannot make.
deep(
  cleanProfile({
    language_tests: [{
      test_type: "IELTS",
      overall_score: "7",
      sub_scores: { writing: "7", speaking: "7", reading: "7", listening: "7" },
    }],
    qualifications: [{
      qualification_type: "Bachelor",
      degree_title: "Bachelors in Computing",
      grade_value: "Upper Second Class",
    }],
  }),
  // Key order matters: deep() compares serialised JSON and cleanProfile emits in PROFILE_KEYS order.
  {
    qualifications: [{
      qualification_type: "Bachelor",
      degree_title: "Bachelors in Computing",
      grade_value: "Upper Second Class",
    }],
    language_tests: [{
      test_type: "IELTS",
      overall_score: "7",
      sub_scores: { writing: "7", speaking: "7", reading: "7", listening: "7" },
    }],
  },
  "all four IELTS components and the degree survive cleaning",
);

// Numeric sub-scores are the likeliest model drift — JSON numbers, not strings. They must be
// coerced, not dropped: a dropped component is invisible in the column.
deep(
  cleanProfile({ language_tests: [{ test_type: "IELTS", sub_scores: { listening: 8, writing: 6.5 } }] }),
  { language_tests: [{ test_type: "IELTS", sub_scores: { listening: "8", writing: "6.5" } }] },
  "numeric sub_scores are coerced to strings, never dropped",
);

// The extractor is told to return {} when a message reveals nothing. That must read as "nothing",
// not as an entry, or the empty object would merge in and dedupe against the real mention later.
ok(cleanProfile({}), null, "an empty extraction result is null, not an entry");

// A single entry emitted as a bare object rather than a one-element array. This used to fail the
// Array.isArray check and vanish without a trace — the column simply stayed null, which is the
// worst failure mode because it is indistinguishable from the model saying nothing.
deep(
  cleanProfile({ qualifications: { degree_title: "BSc Computing", grade_value: "2:1" } }),
  { qualifications: [{ degree_title: "BSc Computing", grade_value: "2:1" }] },
  "a bare object is wrapped into a one-element array",
);
ok(cleanProfile({ qualifications: "BSc Computing" }), null, "a bare string is still rejected");

// The reported regression: one sentence carrying a degree AND a test score must yield both arrays.
deep(
  cleanProfile({
    qualifications: [{ degree_title: "Bachelors in Computing", grade_value: "Upper Second Class" }],
    language_tests: [{ test_type: "IELTS", overall_score: "7" }],
  }),
  {
    qualifications: [{ degree_title: "Bachelors in Computing", grade_value: "Upper Second Class" }],
    language_tests: [{ test_type: "IELTS", overall_score: "7" }],
  },
  "a degree and a test score from one message both survive",
);

// ── The spend gate for the conclusion judgement ──
// The route asks decidePrompt both ways and only pays for a model call when the answer differs.
// That is the same expression, so it is asserted here rather than duplicated in the route.
// The loop above already proves the half that matters for correctness: with the gate shut,
// decidePrompt ignores `concluded` entirely, so `matters` can never be true there.
const matters = (v: Parameters<typeof decidePrompt>[0], n: number) =>
  decidePrompt(v, n, true) !== decidePrompt(v, n, false);

const live = {
  visitor_key: KEYS[0], contact_status: "submitted" as const, contact_prompt_count: 1,
  contact_prompted_at_count: 5, email: "a@b.com", conversation_state: "active" as const,
  end_prompt_count: 0, summary_status: "pending" as const,
};
ok(matters(live, 15), true, "a live visitor with an address and an unspent offer is worth asking about");
ok(matters({ ...live, end_prompt_count: 1 }, 15), false, "the offer is spent — never ask again, the answer cannot act");
ok(matters({ ...live, summary_status: "sent" }, 15), false, "a summary already sent shuts the gate");
ok(matters({ ...live, summary_status: "processing" }, 15), false, "a summary mid-flight shuts the gate");
ok(matters({ ...live, conversation_state: "end_confirmed" }, 15), false, "an already-ended chat has nothing to offer");

/* ── recordTurn writes counters as SQL increments, not as values read a moment ago ── */
// One visitor_key, two tabs: both reads see message_count = 5, both derive nextCount = 6, and an
// absolute write means one of those turns never happened as far as the prompt schedule knows.
// Postgres evaluates every SET expression against the OLD row, so the two "at what count" columns
// use the same expression and stay consistent with it.
const rawOf = (v: unknown) => (v as { __raw?: string } | undefined)?.__raw;

{
  const { db, captured } = fakeDb({});
  await recordTurn(db, 1, { prompted: null, nextCount: 6, sessionId: 9 });
  ok(rawOf(captured.message_count), "message_count + 1", "message_count is incremented in SQL, never written as an absolute");
  ok(captured.message_count === 6, false, "the route's computed count is not written directly");
}

{
  const { db, captured } = fakeDb({});
  await recordTurn(db, 1, { prompted: "contact", nextCount: 6, sessionId: 9 });
  ok(rawOf(captured.contact_prompt_count), "contact_prompt_count + 1", "the contact counter increments in SQL");
  ok(rawOf(captured.contact_prompted_at_count), "message_count + 1", "the contact snapshot uses the same expression as message_count");
}

{
  const { db, captured } = fakeDb({});
  await recordTurn(db, 1, { prompted: "ending", nextCount: 6, sessionId: 9 });
  ok(rawOf(captured.end_prompt_count), "end_prompt_count + 1", "the end counter increments in SQL");
  ok(rawOf(captured.end_prompt_at_count), "message_count + 1", "the end snapshot uses the same expression as message_count");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
