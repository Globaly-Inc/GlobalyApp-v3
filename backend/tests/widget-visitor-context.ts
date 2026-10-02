/**
 * Phase 2 — what a widget visitor has already said, and what the counsellor may keep.
 *
 * Covers the two holes this phase closes: the guest path discarding everything extractProfile
 * captured, and contact details being capturable only through the card.
 *
 * Run: node --import tsx tests/widget-visitor-context.ts   (or: npm run test:widget-visitor-context)
 * Pure functions only. No DB, no model calls.
 */

process.env.DB_USERNAME = process.env.DB_USERNAME || "x";
process.env.DB_PASSWORD = process.env.DB_PASSWORD || "x";
process.env.DB_NAME = process.env.DB_NAME || "x";
process.env.DB_HOST = process.env.DB_HOST || "127.0.0.1";
process.env.JWT_SECRET = process.env.JWT_SECRET || "x";
process.env.GEMINI_API_KEY = "test-key";

const vc = await import("../src/modules/ai-counsellor/lib/visitor-context.js");
const pe = await import("../src/modules/ai-counsellor/lib/profile-extract.js");
const prompt = await import("../src/modules/ai-counsellor/services/prompt.service.js");
const rag = await import("../src/modules/ai-counsellor/services/rag.service.js");
type VisitorRow = import("../src/modules/ai-counsellor/services/visitor.service.js").VisitorRow;

let passed = 0, failed = 0;
const assert = (cond: boolean, label: string, detail?: unknown) => {
  if (cond) { passed++; console.log(`  ok   ${label}`); }
  else { failed++; console.error(`  FAIL ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`); }
};

const visitor = (o: Partial<VisitorRow>): VisitorRow => ({
  id: 1, visitor_key: "v", embed_config_id: 3, session_id: 9,
  name: null, email: null, phone: null, contact_source: null, status: "visitor",
  contact_status: "not_shown", contact_prompt_count: 0, contact_prompted_at_count: null,
  contact_prompted_at: null, contact_submitted_at: null, message_count: 4,
  first_seen_at: new Date(), last_activity_at: new Date(),
  conversation_state: "active", end_prompt_count: 0, end_prompt_at_count: null, end_confirmed_at: null,
  qualifications: null, language_tests: null, academic_tests: null, work_experiences: null,
  age: null, gender: null, nationality: null, nationality_raw: null, study_preference: null,
  summary_status: null, summary_attempts: 0, summary_sent_at: null, summary_error: null,
  created_at: new Date(), updated_at: new Date(), ...o,
} as VisitorRow);

console.log("\n1. visitorProfileContext — nothing said yet");
{
  assert(vc.visitorProfileContext(null) === null, "no visitor row → null");
  assert(vc.visitorProfileContext(visitor({})) === null, "a visitor who has said nothing → null");
  assert(vc.visitorProfileContext(visitor({ study_preference: "MBA" })) === null,
    "a course interest alone is not a profile — it belongs to the session context");
}

console.log("\n2. visitorProfileContext — the structured background maps straight across");
{
  const ctx = vc.visitorProfileContext(visitor({
    nationality: "Nepal",
    language_tests: [{ test_type: "IELTS", overall_score: "6.0" }],
    qualifications: [{ degree_title: "BSc Computing", institution_name: "Tribhuvan" }],
  } as Partial<VisitorRow>))!;
  assert(ctx !== null, "a visitor with a background → a context");
  assert(ctx.profile?.nationality === "Nepal", "nationality carries");
  assert(ctx.language_tests.length === 1 && ctx.language_tests[0]?.overall_score === "6.0",
    "test scores carry verbatim — never rounded, never converted");
  assert(ctx.qualifications.length === 1, "qualifications carry");
  assert(ctx.work_experiences.length === 0 && ctx.academic_tests.length === 0,
    "absent arrays read as empty, not undefined");
}

console.log("\n3. visitorProfileContext — individual_category is never 'student'");
{
  const ctx = vc.visitorProfileContext(visitor({ nationality: "Nepal" }))!;
  assert(ctx.profile?.individual_category === null, "a widget visitor has no platform profile to complete");
  const block = prompt.buildSystemPrompt({ profile: ctx, ragContext: "", isFirstMessage: false });
  assert(!/PROFILE COMPLETION/.test(block),
    "so the prompt never nags them to complete one — the whole reason that field is pinned to null");
  assert(/STUDENT PROFILE/.test(block), "but their background IS in the prompt", block.slice(0, 80));
}

console.log("\n4. visitorProfileContext — eligibility becomes possible");
{
  const ctx = vc.visitorProfileContext(visitor({
    language_tests: [{ test_type: "IELTS", overall_score: "6.0" }],
  } as Partial<VisitorRow>))!;
  const block = prompt.buildSystemPrompt({ profile: ctx, ragContext: "", isFirstMessage: false });
  assert(/ELIGIBILITY CHECK/.test(block),
    "a visitor who gave a test score gets their score compared against course requirements");
}

console.log("\n5. visitorCounsellingContext — the loose scalars");
{
  assert(vc.visitorCounsellingContext(visitor({})) === null, "nothing stated → null");
  const ctx = vc.visitorCounsellingContext(visitor({ study_preference: "MSc Data Science", age: "early 30s", name: "John" }))!;
  assert(ctx.interests?.[0] === "MSc Data Science", "the course they named becomes an interest");
  assert(ctx.notes?.some((n) => n === "age early 30s"), "age is carried VERBATIM, never bucketed", ctx.notes);
  assert(ctx.notes?.some((n) => /John/.test(n)), "a known name is carried so they can be greeted by it");
  assert(!("goals" in ctx), "nothing is invented for keys the visitor never gave");

  const gendered = vc.visitorCounsellingContext(visitor({ gender: "female" }));
  assert(gendered === null, "gender is NOT repeated back — it is off by default in the collection rules");
}

console.log("\n6. the memory query finally carries a situation");
{
  const p = vc.visitorProfileContext(visitor({ nationality: "Nepal" }));
  const c = vc.visitorCounsellingContext(visitor({ study_preference: "MBA" }));
  const situation = rag.situationText(p, c);
  assert(!!situation && /Nepal/.test(situation) && /MBA/.test(situation),
    "situation-bound guidance can now match; before this the query was the message alone", situation);
  assert(rag.situationText(null, null) === null, "and a visitor who said nothing still sends none");
}

console.log("\n7. cleanContact — shape is checked, never trusted");
{
  const ok = pe.cleanContact({ name: "John", email: "john@example.com" }, ["name", "email"]);
  assert(ok?.email === "john@example.com" && ok?.name === "John", "a well-formed pair is kept");

  assert(pe.cleanContact({ email: "not-an-address" }, ["email"]) === null, "a malformed address is dropped");
  assert(pe.cleanContact({ email: "a@b.co" }, ["name"]) === null,
    "a field this institution does not collect is dropped even when the model returns it");
  assert(pe.cleanContact({ phone: "I will call you" }, ["phone"]) === null, "prose is not a phone number");
  assert(pe.cleanContact({ phone: "+977 98 1234 5678" }, ["phone"])?.phone === "+977 98 1234 5678", "a real number is kept");
  assert(pe.cleanContact({}, ["name", "email"]) === null, "nothing returned → null, not an empty object");
}

console.log("\n8. cleanContact — the counsellor's own address is never the visitor's");
{
  const own = ["admissions@uni.edu"];
  assert(pe.cleanContact({ email: "admissions@uni.edu" }, ["email"], own) === null,
    "an address the counsellor put on screen is rejected — the likeliest way to record one nobody gave");
  assert(pe.cleanContact({ email: "John@Example.com" }, ["email"], ["john@example.com"]) === null,
    "matched case-insensitively");
  assert(pe.cleanContact({ email: "visitor@gmail.com" }, ["email"], own)?.email === "visitor@gmail.com",
    "a different address still gets through");
}

console.log("\n9. applyCollectionRules — the stored rule catches what the prompt missed");
{
  const full = { nationality: "Nepal", gender: "female", study_preference: "MBA" } as never;
  const kept = pe.applyCollectionRules(full, ["nationality", "study_preference"]);
  assert(kept !== null && !("gender" in kept), "a disallowed field the model returned anyway is dropped", kept);
  assert(kept !== null && "nationality" in kept, "allowed fields survive");
  assert(pe.applyCollectionRules({ gender: "female" } as never, ["nationality"]) === null,
    "a profile that is entirely disallowed becomes null, not an empty write");
  assert(pe.applyCollectionRules(null, ["nationality"]) === null, "null in, null out");
}

console.log("\n10. worthExtracting — volunteered details are worth a call");
{
  assert(pe.worthExtracting("you can send it to john@example.com"),
    "an address with no keyword around it");
  assert(pe.worthExtracting("my name is John"), "a name statement");
  assert(pe.worthExtracting("email me the details"), "an instruction to make contact");
  assert(pe.worthExtracting("I have IELTS 7"), "the original background path still fires");
  assert(!pe.worthExtracting("thanks, that helps"), "and ordinary chatter still costs nothing");
}

console.log("\n11. the Rack's contact_ask rules reach the card, not just the prompt");
{
  const vs = await import("../src/modules/ai-counsellor/services/visitor.service.js");
  const v = (o: Partial<VisitorRow>) => visitor({ contact_status: "not_shown", ...o });
  const OFF = { enabled: false, first_at: [3, 5] as const, gap: [5, 10] as const };
  const LATE = { enabled: true, first_at: [20, 20] as const, gap: [5, 10] as const };

  // The default must be exactly what every caller got before the rules existed.
  assert(vs.shouldPrompt(v({}), 5), "default schedule still asks around messages 3-5");
  assert(vs.shouldPrompt(v({}), 5, vs.DEFAULT_CONTACT_ASK) === vs.shouldPrompt(v({}), 5),
    "passing the defaults explicitly changes nothing");

  // The bug this closes: the prompt was told not to ask, the card was not.
  assert(!vs.shouldPrompt(v({}), 5, OFF), "disabled → the card never fires on the count rule");
  assert(vs.decidePrompt(v({}), 5, false, OFF) === null, "disabled → decidePrompt offers no contact card");
  assert(vs.decidePrompt(v({}), 5, true, OFF) === null,
    "disabled → not even at a natural ending, which is the one place the card is brought FORWARD");

  // A conversation that concluded with an address still gets the wrap-up offer: that card is
  // about ending the chat, not about collecting anything.
  assert(vs.decidePrompt(v({ email: "a@b.co", summary_status: null }), 5, true, OFF) === "ending",
    "disabled → the wrap-up offer is unaffected; it collects nothing");

  assert(!vs.shouldPrompt(v({}), 5, LATE), "a later first_at pushes the first ask out");
  assert(vs.shouldPrompt(v({}), 20, LATE), "and it fires once the count reaches it");
}

console.log("\n12. 'sensitive' is subtracted from what is kept, not only announced");
{
  // The portal calls these "use it to answer, never record it". `sensitive` is a SUBSET of
  // `allowed`, so passing `allowed` straight through stored exactly the fields it promised not to.
  const allowed = ["nationality", "study_preference", "work_experiences"];
  const sensitive = ["work_experiences"];
  const keepable = allowed.filter((f) => !sensitive.includes(f));

  const extracted = { nationality: "Nepal", work_experiences: [{ job_title: "Nurse" }] } as never;
  const kept = pe.applyCollectionRules(extracted, keepable);
  assert(kept !== null && !("work_experiences" in kept), "a sensitive field is not stored", kept);
  assert(kept !== null && "nationality" in kept, "a merely-allowed field still is", kept);
  assert(pe.applyCollectionRules(extracted, allowed) !== null
    && "work_experiences" in (pe.applyCollectionRules(extracted, allowed) as object),
    "and the un-subtracted list is what used to leak it — the subtraction is the fix, not the filter");
}

console.log("\n13. unreadable rules fail CLOSED, not open");
{
  // The guest route's own expression, asserted here because it is the whole fix: when the Rack
  // read is degraded the rules we hold are DEFAULTS, and the default allow-list is wider than a
  // narrowed one — so trusting it would store fields the institution had switched off.
  const keepableFor = (collection: { allowed: string[]; sensitive: string[] } | null, rulesUnknown: boolean) =>
    collection
      ? collection.allowed.filter((f) => !collection.sensitive.includes(f))
      : rulesUnknown ? [] : undefined;

  assert(keepableFor(null, true)?.length === 0,
    "degraded → an EMPTY keep-list, so nothing is extracted and nothing is written");
  assert(keepableFor(null, false) === undefined,
    "no institution at all → undefined, which means the built-in set, not a lockout");
  assert(keepableFor({ allowed: ["nationality"], sensitive: [] }, false)?.length === 1,
    "a readable rule set is used as given");

  // And an empty keep-list really does drop everything, rather than being ignored as falsy.
  const extracted = { nationality: "Nepal", study_preference: "MBA" } as never;
  assert(pe.applyCollectionRules(extracted, []) === null,
    "an empty allow-list stores nothing — the lockout is real, not cosmetic");
}

console.log("\n14. withdrawing permission applies to details ALREADY stored");
{
  // The gap: collection rules gated the WRITE, so a field switched off yesterday kept flowing
  // into today's prompt and memory query from rows written while it was still on.
  const stored = visitor({
    name: "John", age: "24", gender: "female", nationality: "Nepal", nationality_raw: "Nepali",
    study_preference: "MBA",
    language_tests: [{ test_type: "IELTS", overall_score: "7" }],
    work_experiences: [{ job_title: "Nurse" }],
  } as Partial<VisitorRow>);

  // The institution has since narrowed itself to the course and the English test.
  const narrowed = vc.applyCollectionRules(stored, ["study_preference", "language_tests"])!;
  assert(narrowed.nationality === null && narrowed.nationality_raw === null,
    "a withdrawn field is stripped, and its raw wording goes with it");
  assert(narrowed.age === null && narrowed.gender === null && narrowed.name === null,
    "so are the other scalars");
  assert(narrowed.work_experiences === null, "and the withdrawn arrays");
  assert(narrowed.study_preference === "MBA" && narrowed.language_tests?.length === 1,
    "what is still allowed survives untouched");

  // And the stripping really reaches the two things that consume it.
  const p = vc.visitorProfileContext(narrowed);
  assert(p?.profile?.nationality == null, "the prompt's STUDENT PROFILE loses the withdrawn nationality");
  assert(p?.language_tests.length === 1, "but keeps the test score it may still use");
  const c = vc.visitorCounsellingContext(narrowed);
  assert(!c?.notes?.some((n) => /John|24/.test(n)), "the session notes lose the withdrawn name and age", c?.notes);
  assert(rag.situationText(p, c)?.includes("Nepal") !== true,
    "and the memory query stops carrying it", rag.situationText(p, c));

  // Unknown rules fail closed, same stance as the extractor's empty keep-list.
  assert(vc.applyCollectionRules(stored, [])?.nationality === null, "no readable rules → nothing is used");
  assert(vc.applyCollectionRules(stored, undefined)?.nationality === "Nepal",
    "no institution at all → unchanged, which is the built-in behaviour and not a lockout");
}

console.log("\n14b. custom fields — model output in, labelled guidance out");
{
  const FIELDS = [
    { key: "preferred_intake", label: "Preferred intake", may_ask: true },
    { key: "budget", label: "Budget", may_ask: false },
  ];

  // The cleaner is the trust boundary: configured keys only, whatever the model returned.
  const kept = pe.cleanCustom({ custom: {
    preferred_intake: "  September 2027  ",
    budget: 15000,
    religion: "none of your business",
  } }, FIELDS);
  assert(kept?.preferred_intake === "September 2027", "a configured key is trimmed and kept", kept);
  assert(kept?.budget === "15000", "a number is stringified, like a score in cleanProfileEntry", kept);
  assert(kept && !("religion" in kept), "a subject this institution never defined has nowhere to land", kept);
  assert(pe.cleanCustom({ custom: { preferred_intake: "Sept" } }, []) === null,
    "no configured fields → nothing is kept, so deleting a field stops the writes too");
  assert(pe.cleanCustom({ custom: "Sept" }, FIELDS) === null, "a scalar where the object should be is not a value");
  assert(pe.cleanCustom({}, FIELDS) === null, "and a turn that revealed none returns null, not {}");

  // A message carrying ONLY a custom answer has no background keyword in it. Without the label
  // hint the prefilter drops it, and a message it drops is never looked at again.
  const ANSWER = "the autumn one";
  const ASKED = "Which intake were you thinking of?";
  assert(!pe.worthExtracting(ANSWER, ASKED),
    "neither the answer nor the question carries a background keyword, so the fixed filter drops the turn");
  assert(pe.worthExtracting(ANSWER, ASKED, FIELDS),
    "the configured labels are what make it worth a call — without them this fact is lost for good");
  assert(pe.worthExtracting("my budget is about 15k", undefined, FIELDS),
    "and the visitor naming the subject themselves is enough on its own");

  // A short label is the case a length floor silently swallows: no hint at all, so the answer
  // to the counsellor's own question is dropped and lost for good.
  const SHORT = [{ key: "zip", label: "ZIP", may_ask: true }];
  assert(pe.worthExtracting("90210", "What is your ZIP?", SHORT),
    "a three-letter label still makes its own answers eligible");
  assert(!pe.worthExtracting("90210", "What is your ZIP?"),
    "and it is the configured label doing it — nothing else in that exchange says background");

  // Two more shapes the label vocabulary has to survive.
  assert(pe.worthExtracting("सेप्टेम्बर", "कुन सत्र?", [{ key: "satra", label: "कुन सत्र", may_ask: true }]),
    "a label in a script [a-z] cannot spell still produces a hint");
  const COMMON = [{ key: "why_us", label: "Why us", may_ask: true }];
  assert(pe.worthExtracting("because of the ranking", "Why us?", COMMON),
    "a label of nothing but common words falls back to the whole phrase rather than to no hint");
  assert(pe.worthExtracting("hello", undefined, FIELDS) === false,
    "and none of this makes an empty pleasantry worth a call");

  // The read-back end: labelled with the institution's words, and gated by the CURRENT list.
  const v = visitor({});
  const STORED = { preferred_intake: "September 2027", budget: "15000" };
  const notes = vc.visitorCounsellingContext(v, FIELDS, STORED)?.notes ?? [];
  assert(notes.includes("Preferred intake: September 2027"),
    "the counsellor is told what it already knows, in the institution's own words", notes);
  const dropped = vc.visitorCounsellingContext(v, [FIELDS[0]], STORED)?.notes ?? [];
  assert(!dropped.some((n) => /Budget/.test(n)),
    "a field the institution deleted stops being read back, though its row is still there", dropped);
  assert(!vc.visitorCounsellingContext(v, [], STORED)?.notes?.some((n) => /2027/.test(n)),
    "and an unreadable rule set (empty list) reads none of it back");
}

console.log("\n14c. the custom values table — one answer per visitor per field");
{
  // No connection: a knex query builder with a client and no pool renders SQL and talks to
  // nothing. What is being checked is the conflict target, which is the whole reason this is a
  // table — a typo there turns "the latest answer wins" into a duplicate row per turn.
  const { default: knexFactory } = await import("knex");
  const k = knexFactory({ client: "pg" });
  const sql = k("ai_widget_visitor_custom_values")
    .insert([{ visitor_id: 1, field_key: "budget", value: "15000" }])
    .onConflict(["visitor_id", "field_key"])
    .merge({ value: k.ref("excluded.value"), updated_at: k.fn.now() })
    .toString();
  assert(/on conflict \("visitor_id", "field_key"\) do update/.test(sql),
    "upserted on the unique pair the migration creates", sql);
  assert(/"value" = "excluded"\."value"/.test(sql), "the latest answer replaces the last one", sql);
  assert(/"updated_at" = CURRENT_TIMESTAMP/.test(sql),
    "and updated_at is said outright, not inherited from the proposed row's default", sql);
  assert(!/created_at/.test(sql), "created_at is never touched, so it keeps saying when they first told us", sql);
}

console.log("\n15. askAt degrades to the minimum, never to NaN");
{
  const vs = await import("../src/modules/ai-counsellor/services/visitor.service.js");
  // The schema rejects a reversed range, so this is the second line: a pair arriving by any
  // other route (hand-written SQL, a caller that skips zod) must not mute the card forever.
  const REVERSED = { enabled: true, first_at: [5, 4] as const, gap: [5, 10] as const };
  const v = visitor({ contact_status: "not_shown" });
  assert(vs.shouldPrompt(v, 5, REVERSED), "a reversed range falls back to asking at its minimum");
  assert(vs.shouldPrompt(v, 99, REVERSED), "and keeps working above it — not a NaN comparison, which is false forever");
  assert(!vs.shouldPrompt(v, 1, REVERSED), "while still respecting that minimum");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
