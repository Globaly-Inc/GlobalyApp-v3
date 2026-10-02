/**
 * Institution memory learning — what becomes memory and what never does.
 *
 * Run: node --import tsx tests/institution-memory-learning.ts   (or: npm run test:institution-memory-learning)
 * Fake wire: tests/institution-memory.harness.ts. The extractor is faked at llm-client's
 * `_llmDeps.generate` seam, so extractJson's own JSON parsing still runs; Jev is faked at
 * lib/jev.ts's `_jevDeps.systemOne` seam and answers neutrally unless a case says otherwise.
 * No DB, no models.
 */

process.env.DB_USERNAME = process.env.DB_USERNAME || "x";
process.env.DB_PASSWORD = process.env.DB_PASSWORD || "x";
process.env.DB_NAME = process.env.DB_NAME || "x";
process.env.DB_HOST = process.env.DB_HOST || "127.0.0.1";
process.env.JWT_SECRET = process.env.JWT_SECRET || "x";
process.env.GEMINI_API_KEY = "test-key";
process.env.EMBEDDING_PROVIDER = "gemini";
process.env.TYPESAFE_API_KEY = "test-key"; // config reads it at load; the client itself is never built

const h = await import("./institution-memory.harness.js");
const { assert, reset, all, count, find, INST, OTHER_INST, ID, ID2, HEX, INSERT_MEMORY, UPDATE_MEMORY, SELECT_MEMORY } = h;
const learn = await import("../src/modules/institution-memory/services/learning.service.js");
const schema = await import("../src/modules/institution-memory/schemas/memory.schema.js");
const { _llmDeps } = await import("../src/modules/superadmin/data-extraction/lib/llm-client.js");
const jev = await import("../src/modules/institution-memory/lib/jev.js");
type Candidate = import("../src/modules/institution-memory/schemas/memory.schema.js").ExtractionCandidate;

// ── Jev fake ─────────────────────────────────────────────────────────────────
// Neutral by default: not a person, not a fact, is guidance, endorsed, no contradictions, every
// guidance followed. Cases override single keys, or the whole function.
let jevCalls: Array<{ state: unknown; keys: string[] }> = [];
let jevOverride: Record<string, number> = {};
const neutral = (k: string) => k.startsWith("c") ? 0 : k.startsWith("f") ? 1 : k === "mentions_person" || k === "is_fact" ? 0 : 1;
const jevFake = (async (req: { state: { proposed_type?: string }; questions: Record<string, unknown> }) => {
  const keys = Object.keys(req.questions);
  jevCalls.push({ state: req.state, keys });
  // Overrides target derived candidates; the correction's own judgement stays neutral.
  const override = req.state?.proposed_type === "COUNSELLOR_CORRECTION" ? {} : jevOverride;
  return { model: "fake", usage: { input_tokens: 0, output_tokens: 0 },
    answers: Object.fromEntries(keys.map((k) => [k, { type: "noul", noul: override[k] ?? neutral(k) }])) };
}) as unknown as typeof jev._jevDeps.systemOne;
jev._jevDeps.systemOne = jevFake;

// ── Model fake ───────────────────────────────────────────────────────────────
let modelCalls: Array<{ system: string; prompt: string }> = [];
let modelReply: unknown = { candidates: [] };
_llmDeps.generate = async (_model, system, prompt) => {
  modelCalls.push({ system, prompt });
  return { text: JSON.stringify(modelReply), usage: undefined, truncated: false };
};

// ── Fixtures ─────────────────────────────────────────────────────────────────
const MSG = /from "ai_counselor_messages" where "id" = \$1/;
const QUESTION = /from "ai_counselor_messages" where "session_id"/;
const SESSION = /from "ai_counselor_sessions"/;
const CONFIG = /from "ai_embed_configs"/;
const USER = /from "platform_users"/;
const QUALS = /from "platform_user_qualifications"/;
const TRANSCRIPT = /from "ai_counselor_messages" where "session_id" = \$1 order by/;

const message = (o: Record<string, unknown> = {}) => ({
  id: 77, session_id: 3, role: "assistant", content: "Refunds take 14 days.", feedback: null, feedback_actor: null,
  review_status: "corrected", correction: "Refunds are processed within 28 days of a written withdrawal; say so and point to the policy page.",
  review_note: "Always quote the policy page.", memory_ids: [], ...o,
});
const session = (o: Record<string, unknown> = {}) => ({ id: 3, platform_user_id: 42, visitor_key: null, embed_config_id: 9, ...o });
const config = (o: Record<string, unknown> = {}) => ({ id: 9, institution_id: INST, business_id: null, auto_learn: false, display_name: "Test Uni", ...o });
const baseRoutes = (over: Record<string, unknown> = {}): h.Route[] => [
  [MSG, () => [message(over.message as Record<string, unknown>)]],
  [QUESTION, () => [{ content: "How long do refunds take?" }]],
  [SESSION, () => [session(over.session as Record<string, unknown>)]],
  [CONFIG, () => [config(over.config as Record<string, unknown>)]],
  [USER, () => [{ first_name: "Priya", last_name: "Sharma" }]],
  [QUALS, () => [{ institution_name: "Kathmandu Model College" }]],
  [INSERT_MEMORY, (s) => [{ id: s.values.includes("COUNSELLOR_CORRECTION") ? ID : ID2 }]],
  [SELECT_MEMORY, (s) => [h.row({ id: String(s.values[0]), status: s.values[0] === ID ? "active" : "candidate" })]],
];
const uuidIn = (s: h.Stmt) => String(s.values.find((v) => typeof v === "string" && /^[0-9a-f-]{36}$/.test(v)) ?? ID);
const cand = (o: Partial<Candidate>): Candidate => ({
  type: "RESPONSE_PATTERN", content: "When asked about refunds, state the timeframe and point to the policy page.",
  metadata: { technique: "answer_then_ask", trigger: "refund question" }, confidence: 0.8, mentions_person: false, ...o,
});

console.log("\n0. evaluateCandidate — sensitive CATEGORIES, which PII_RE cannot see");
{
  const names = ["john"];
  const ev = (content: string) => learn.evaluateCandidate(
    { type: "COUNSELLING_GUIDELINE", content, metadata: {}, confidence: 0.9, mentions_person: false },
    names,
  );
  // Each of these names nobody, states no figure, and IS genuine guidance — so every other
  // filter in the file passes it. What makes it unacceptable is the category it reasons about.
  const rejected = (content: string, label: string) => {
    const out = ev(content);
    assert(!out.ok && out.reason === "sensitive_category", label, out.ok ? "accepted" : out.reason);
  };
  rejected("Students with depression should be offered a deferral.", "mental health");
  rejected("Applicants with a disability need the longer application route.", "disability");
  rejected("Asylum seekers cannot be offered the scholarship.", "immigration status");
  rejected("Muslim students should be told about prayer facilities first.", "religion");
  rejected("Students who cannot afford the deposit should be steered to cheaper courses.", "financial hardship");

  // And the filter must not swallow ordinary counselling, or it would quietly stop all learning.
  assert(ev("Ask what the student wants from the course before recommending one.").ok,
    "ordinary counselling guidance is untouched");
  assert(ev("Explain the application steps in order rather than all at once.").ok,
    "and so is ordinary process guidance");

  // It reaches free-text metadata too — `concern` is exactly where a health category would land.
  const meta = learn.evaluateCandidate(
    { type: "STUDENT_CONCERN_PATTERN", content: "Visitors often worry before applying.",
      metadata: { concern: "anxiety about the interview", approach: "reassure them" },
      confidence: 0.9, mentions_person: false },
    names,
  );
  assert(!meta.ok && meta.reason === "sensitive_category", "and it is checked in metadata, not only content", meta);
}

console.log("\n0b. near-duplicate merge — and why contradiction is checked FIRST");
{
  // The ordering this pins down is the dangerous one. Two statements can be ~0.9 apart because
  // they share almost every word and still mean the opposite ("discuss refunds BEFORE an offer"
  // vs "only AFTER an offer"). Merging on similarity before asking whether they agree would
  // reinforce the memory that says the reverse — a disagreement counted as evidence FOR the
  // thing being disagreed with. §4 below is that exact pair and must stay a conflict, not a merge.
  assert(learn.MERGE_SIMILARITY >= 0.85,
    "the merge threshold is high enough that it fires on a restatement, not a neighbour",
    learn.MERGE_SIMILARITY);
}

console.log("\n0c. GENERAL_KNOWLEDGE — the one type that may state a fact, and what it pays for it");
{
  const names = ["john"];
  const gk = (content: string, metadata: Record<string, unknown> = { topic: "visas" }) =>
    learn.evaluateCandidate(
      { type: "GENERAL_KNOWLEDGE", content, metadata, confidence: 0.9, mentions_person: false }, names);
  const guideline = (content: string) =>
    learn.evaluateCandidate(
      { type: "COUNSELLING_GUIDELINE", content, metadata: {}, confidence: 0.9, mentions_person: false }, names);

  const fact = "Australian student visas generally require evidence of funds for 2026 entry.";
  assert(gk(fact).ok, "a sector fact is accepted — figures and years included");
  const asGuideline = guideline(fact);
  assert(!asGuideline.ok && asGuideline.reason === "fact_like",
    "the SAME sentence as a guideline is still refused: the licence belongs to the type, not the text",
    asGuideline);

  // The licence is narrow. Everything that protects a person still applies.
  assert(!gk("John's visa needed proof of funds.").ok, "a named person is still rejected");
  assert(!gk("Email admissions@uni.edu about visa funds.").ok, "PII is still rejected");
  assert(!gk("Refugee applicants generally need extra visa documents.").ok,
    "and a sensitive category is still rejected, fact or not");

  assert(!gk(fact, {}).ok, "metadata must carry the topic it is filed under");

  // What it pays: no quantity of reinforcement activates it.
  assert(schema.NEVER_AUTO_PROMOTES.has("GENERAL_KNOWLEDGE"),
    "GENERAL_KNOWLEDGE can never auto-promote — three students hearing the same wrong answer is "
    + "three students misinformed, not three confirmations");
  assert(!schema.NEVER_AUTO_PROMOTES.has("RESPONSE_PATTERN"),
    "while a counselling technique still promotes on the crowd signal, which is what it is for");
}

console.log("\n1. evaluateCandidate — the filters (pure)");
{
  const names = ["Priya", "Sharma", "Kathmandu Model College"];
  const ev = (c: Partial<Candidate>, opts?: { allowFacts?: boolean }) => learn.evaluateCandidate(cand(c), names, opts);
  assert(ev({}).ok, "a technique with valid metadata passes");
  assert(!ev({ mentions_person: true }).ok && (ev({ mentions_person: true }) as { reason: string }).reason === "mentions_person", "mentions_person rejected");
  assert((ev({ confidence: 0.59 }) as { reason: string }).reason === "confidence", "confidence below 0.6 rejected");
  assert((ev({ content: "Email priya@example.com for the refund form." }) as { reason: string }).reason === "pii", "email rejected");
  assert((ev({ content: "Call +61 412 345 678 to confirm." }) as { reason: string }).reason === "pii", "phone rejected");
  assert((ev({ content: "Tell students like Priya to ask about refunds early." }) as { reason: string }).reason === "known_name", "student's own name rejected");
  assert((ev({ content: "Students from kathmandu model college usually need a transcript first." }) as { reason: string }).reason === "known_name", "profile institution name rejected (whole word, case-insensitive)");
  assert((ev({ content: "Tuition is $12,000 per year for this course." }) as { reason: string }).reason === "fact_like", "money rejected");
  assert((ev({ content: "The course requires IELTS 6.5 overall." }) as { reason: string }).reason === "fact_like", "test score rejected");
  assert((ev({ content: "Applications for 2027 close in October." }) as { reason: string }).reason === "fact_like", "year rejected");
  assert(ev({ type: "COUNSELLOR_CORRECTION", content: "Refunds take 28 days, not 14.", metadata: { message_id: 77 } }, { allowFacts: true }).ok, "allowFacts lets a human correction keep its figures");
  assert((ev({ metadata: { technique: "nope", trigger: "x" } }) as { reason: string }).reason === "metadata", "bad metadata for the type rejected");
  assert((ev({ type: "TERMINOLOGY", metadata: {} }) as { reason: string }).reason === "metadata", "missing required metadata rejected");

  // ── Metadata gets the privacy filters too, on its free-text keys ───────────
  // Only `content` used to be filtered; metadata got a zod SHAPE check that inspects no text,
  // and memory reads return metadata verbatim to the institution portal. COUNSELLOR_CORRECTION's
  // original_excerpt was the instance Greptile named and it was deleted, but the hole was the
  // class: the extractor writes `example`, `concern`, `approach`, `trigger`, `term`, `meaning`
  // in its own words, lifted from the transcript.
  const md = (m: Record<string, unknown>, type: Candidate["type"] = "RESPONSE_PATTERN") => ev({ type, metadata: m });
  assert((md({ technique: "answer_then_ask", trigger: "refund question", example: "Priya asked how long refunds take." }) as { reason: string }).reason === "known_name",
    "a student's name in RESPONSE_PATTERN.example is rejected");
  assert((md({ technique: "answer_then_ask", trigger: "refund question", example: "Reply to priya@example.com within a day." }) as { reason: string }).reason === "pii",
    "an email address in metadata is rejected");
  assert((md({ concern: "Priya is worried about visa refusal", approach: "reassure" }, "STUDENT_CONCERN_PATTERN") as { reason: string }).reason === "known_name",
    "a name in STUDENT_CONCERN_PATTERN.concern is rejected");
  assert((md({ prefer: ["nursing"], avoid: ["anything Priya mentioned"] }, "COURSE_RECOMMENDATION_RULE") as { reason: string }).reason === "known_name",
    "…and inside a string ARRAY, not just a bare string");
  assert(md({ technique: "answer_then_ask", trigger: "refund question", example: "Say the timeframe, then point to the policy page." }).ok,
    "clean free-text metadata still passes");

  // The other direction, which is why the free-text keys are listed rather than "every string":
  // PII_RE's phone pattern matches the digits in an ISO date, so scanning structured values
  // would reject valid policy metadata.
  assert(ev({ type: "INSTITUTION_POLICY", metadata: { effective_until: "2027-01-01", url: "https://uni.edu/policy/12345678" } }, { allowFacts: true }).ok,
    "a date and a digit-bearing url in metadata are NOT treated as PII");

  // With a Jev judgement, Jev's answers win over the extractor's self-report.
  const J = (o: Partial<jev.CandidateJudgement>) => ({ mentions_person: 0, is_fact: 0, is_technique: 1, endorsed: 1, ...o });
  const evj = (c: Partial<Candidate>, j: Partial<jev.CandidateJudgement>, opts?: { allowFacts?: boolean }) => learn.evaluateCandidate(cand(c), names, { ...opts, judgement: J(j) });
  assert((evj({ mentions_person: false }, { mentions_person: 0.9 }) as { reason: string }).reason === "mentions_person", "Jev: person-mention the extractor missed → rejected");
  assert((evj({}, { is_fact: 0.8 }) as { reason: string }).reason === "fact_like", "Jev: fact the regexes missed → rejected");
  assert(evj({}, { is_fact: 0.8 }, { allowFacts: true }).ok, "Jev: fact allowed when allowFacts (a human correction)");
  assert((evj({}, { is_technique: 0.2 }) as { reason: string }).reason === "not_guidance", "Jev: not guidance → rejected");
  assert((evj({ confidence: 0.9 }, { endorsed: 0.4 }) as { reason: string }).reason === "confidence", "Jev: weak endorsement lowers confidence below the floor");
  const kept = evj({ confidence: 0.9 }, { endorsed: 0.7 });
  assert(kept.ok && kept.confidence === 0.7, "stored confidence is the LOWER of extractor and Jev", kept);
  assert(evj({ confidence: 0.9 }, {}).ok && (evj({ confidence: 0.9 }, {}) as { confidence: number }).confidence === 0.9, "neutral Jev leaves the extractor's confidence");
}

console.log("\n2. learnFromCorrection: correction stored active; derived rules are candidates; filters applied");
{
  modelCalls = [];
  modelReply = { candidates: [
    cand({}),
    cand({ content: "Remind Priya to check the policy page.", type: "GENERAL_CONTEXT", metadata: {} }),
    cand({ content: "Refunds cost $50 to process.", type: "INSTITUTION_POLICY", metadata: {} }),
    cand({ content: "A second good one, within the cap.", type: "GENERAL_CONTEXT", metadata: {}, confidence: 0.9 }),
    cand({ content: "A third good one that must be cut by the cap.", type: "GENERAL_CONTEXT", metadata: {}, confidence: 0.9 }),
  ] };
  reset(baseRoutes());
  const r = await learn.learnFromCorrection({ kind: "correction", institution_id: INST, message_id: 77 });
  const inserts = all(INSERT_MEMORY);
  assert(inserts.length === 3, "three inserts: the correction and two surviving derived rules", inserts.length);
  assert(inserts.some((s) => s.values.some((v) => typeof v === "string" && v.includes("second good one"))), "second survivor stored");
  const corr = inserts.find((s) => s.values.includes("COUNSELLOR_CORRECTION"));
  assert(!!corr && corr.values.includes("correction") && corr.values.includes("active") && corr.values.some((v) => typeof v === "string" && v.includes("28 days")), "correction: source correction, ACTIVE, verbatim text with its figures", corr?.values);
  // The reply being corrected is never copied into memory: only `content` is PII-filtered, and a
  // reply can repeat the student's own name or contact details. message_id is the pointer, and
  // reading through it respects the conversation being deleted.
  assert(!corr?.values.some((v) => typeof v === "string" && v.includes("14 days")), "correction metadata keeps no copy of the original reply", corr?.values);
  const derived = inserts.find((s) => s.values.includes("RESPONSE_PATTERN"));
  assert(!!derived && derived.values.includes("candidate") && derived.values.includes("correction"), "derived rule: candidate, source correction", derived?.values);
  assert(r.created === 3 && r.rejected.known_name === 1 && r.rejected.fact_like === 1, "result counts: rejected candidates do not consume the derived-rule cap", r);
  assert(!inserts.some((s) => s.values.some((v) => typeof v === "string" && v.includes("third good one"))), "cap of 2 derived rules still applies to survivors");
  assert(modelCalls.length === 1 && /corrected it to:\n.*28 days/s.test(modelCalls[0]!.prompt) && /Their note: Always quote/.test(modelCalls[0]!.prompt), "extractor saw question, reply, correction and note");
  assert(/never store facts/i.test(modelCalls[0]!.system) && /mentions_person/.test(modelCalls[0]!.system), "system prompt forbids facts and requires mentions_person");
  const judged = jevCalls.filter((c) => c.keys.includes("mentions_person"));
  assert(judged.length === 5, "Jev judged the correction and each derived candidate up to the survivor cap (1 + 4)", judged.length);
  // TWO queries per survivor, not one: the active set is fetched on its own so that nearer
  // candidates can never crowd a contradicting active rule out of the window.
  assert(count(h.MATCH_FN) === 4, "each survivor fetched BOTH neighbour windows (2 survivors x 2 scopes)", count(h.MATCH_FN));
}

console.log("\n2a. approved / flagged reviews act on the memories the reply used");
{
  // Match the SET clause: RETURNING lists every column, so "reinforce_count" appears in a vote too.
  const VOTE = /'\{(?:positive|negative)_voters\}'/;
  const REINFORCE = /set "reinforce_count"/;
  const used = { message: { review_status: "approved", correction: null, reviewed_by: 501, memory_ids: [ID, ID2] } };
  // Votes and reinforcements return the updated row; without it the vote reads as a duplicate.
  const withUpdates = (over: Record<string, unknown>): h.Route[] => [
    [UPDATE_MEMORY, (s) => [h.row({ id: uuidIn(s), source_reference: { actors: [], positive_voters: [HEX(1)], negative_voters: [HEX(1)] } })]],
    ...baseRoutes(over),
  ];
  modelCalls = [];
  reset(withUpdates(used));
  let r = await learn.learnFromCorrection({ kind: "correction", institution_id: INST, message_id: 77 });
  assert(modelCalls.length === 0 && count(INSERT_MEMORY) === 0, "approve: no extractor call, nothing new stored");
  assert(all(UPDATE_MEMORY).filter((s) => /'\{positive_voters\}'/.test(s.text)).length === 2, "approve: one positive vote per memory used");
  assert(all(UPDATE_MEMORY).filter((s) => REINFORCE.test(s.text)).length === 2 && r.reinforced === 2, "approve: each reinforced once", r);
  const voter = all(UPDATE_MEMORY).find((s) => /'\{positive_voters\}'/.test(s.text))!.values.find((v) => typeof v === "string" && /^[0-9a-f]{16}$/.test(v));
  assert(typeof voter === "string", "the reviewer is recorded as a 16-hex hash, not their id");

  reset(withUpdates({ message: { ...used.message, review_status: "flagged" } }));
  r = await learn.learnFromCorrection({ kind: "correction", institution_id: INST, message_id: 77 });
  const negatives = all(UPDATE_MEMORY).filter((s) => /'\{negative_voters\}'/.test(s.text)).length;
  assert(negatives === 2 && !all(UPDATE_MEMORY).some((s) => REINFORCE.test(s.text)), "flag: one negative vote per memory used, no reinforcement", { negatives, updates: all(UPDATE_MEMORY).map((s) => s.text.slice(0, 60)) });

  reset(withUpdates({ message: { ...used.message, reviewed_by: null } }));
  await learn.learnFromCorrection({ kind: "correction", institution_id: INST, message_id: 77 });
  assert(!all(UPDATE_MEMORY).some(VOTE.test.bind(VOTE)), "no reviewer id → nothing to attribute, nothing voted");
}

console.log("\n2b. Jev catches what the extractor and regexes miss");
{
  modelCalls = []; jevCalls = [];
  modelReply = { candidates: [cand({ content: "Tell that student from Pokhara to apply early." })] };
  jevOverride = { mentions_person: 0.85 };
  reset(baseRoutes());
  let r = await learn.learnFromCorrection({ kind: "correction", institution_id: INST, message_id: 77 });
  assert(r.rejected.mentions_person === 1 && all(INSERT_MEMORY).length === 1, "derived candidate rejected on Jev's person call; only the correction stored", r);
  jevOverride = { is_technique: 0.1 };
  reset(baseRoutes());
  r = await learn.learnFromCorrection({ kind: "correction", institution_id: INST, message_id: 77 });
  assert(r.rejected.not_guidance === 1, "derived candidate rejected as not guidance", r);
  jevOverride = {};
}

console.log("\n2c. A contradicting candidate is stored linked, never as a plain candidate");
{
  modelCalls = []; jevCalls = [];
  modelReply = { candidates: [cand({ type: "INSTITUTION_POLICY", content: "Discuss refunds before the student has an offer.", metadata: {} })] };
  jevOverride = { c0: 0.9 };
  reset([
    [h.MATCH_FN, () => [{ id: ID, type: "INSTITUTION_POLICY", content: "Refunds are discussed only after an offer.", metadata: {}, source: "admin", confidence: 1, importance: 3, status: "active", reinforce_count: 0, use_count: 0, similarity: 0.9 }]],
    ...baseRoutes(),
  ]);
  const r = await learn.learnFromCorrection({ kind: "correction", institution_id: INST, message_id: 77 });
  const linked = all(INSERT_MEMORY).find((s) => s.values.includes("INSTITUTION_POLICY") && !s.values.includes("COUNSELLOR_CORRECTION"));
  assert(r.conflicting === 1 && r.created === 1, "one conflicting, one created (the correction)", r);
  assert(!!linked && /"conflicts_with_id"/.test(linked.text) && linked.values.includes(ID) && linked.values.includes("candidate"), "stored as a candidate with conflicts_with_id = the admin memory", linked?.values);
  const hist = linked?.values.find((v): v is string => typeof v === "string" && v.startsWith("[{"));
  assert(!!hist && JSON.parse(hist).some((e: { event: string }) => e.event === "conflict_flagged"), "history carries conflict_flagged");
  const check = jevCalls.find((c) => c.keys[0] === "c0");
  assert(!!check && JSON.stringify(check.state).includes("Discuss refunds before") && JSON.stringify(check.state).includes("only after an offer"), "Jev saw the new statement and the neighbour");
  assert(h.embedCalls.length >= 1, "one embedding served both the contradiction check and the insert");
  jevOverride = {};
}

console.log("\n2d. A contradicted CANDIDATE is never merged into — the gap between two right decisions");
{
  // The bug this pins down lived between two individually-correct choices:
  //   - the contradiction check was narrowed to ACTIVE memories, because flagging one unreviewed
  //     candidate against another blocks both behind a decision nobody can make;
  //   - the near-duplicate merge was widened to INCLUDE candidates, because two paraphrases of
  //     the same unreviewed observation are exactly what it exists to fold together.
  // Together they left a hole: a statement contradicting a CANDIDATE raised no conflict, so the
  // merge read it as a restatement and reinforced the memory saying the opposite — which three
  // distinct visitors would then promote. The question is now asked of every neighbour the merge
  // could touch; only the FLAG stays active-only.
  modelCalls = []; jevCalls = [];
  modelReply = { candidates: [cand({ type: "INSTITUTION_POLICY", content: "Discuss refunds before the student has an offer.", metadata: {} })] };
  jevOverride = { c0: 0.9 }; // Jev: these disagree
  reset([
    // Same wording distance as 2c (0.9) and the same disagreement — but UNREVIEWED.
    //
    // The route HONOURS the statuses binding, which is what makes this test mean anything: the
    // active-only window must come back EMPTY, exactly as Postgres would answer it, or the
    // candidate leaks into the set a conflict can be flagged against and the assertion passes
    // for the wrong reason.
    [h.MATCH_FN, (stmt) => (JSON.stringify(stmt.values).includes("candidate")
      ? [{ id: ID, type: "INSTITUTION_POLICY", content: "Refunds are discussed only after an offer.", metadata: {}, source: "extracted", confidence: 0.7, importance: 3, status: "candidate", reinforce_count: 0, use_count: 0, similarity: 0.9 }]
      : [])],
    ...baseRoutes(),
  ]);
  const r = await learn.learnFromCorrection({ kind: "correction", institution_id: INST, message_id: 77 });

  assert(r.reinforced === 0,
    "the disagreement is NOT counted as support for the candidate it contradicts", r);
  const stored = all(INSERT_MEMORY).find((st) => st.values.includes("INSTITUTION_POLICY") && !st.values.includes("COUNSELLOR_CORRECTION"));
  assert(!!stored, "it lands as its own row instead", stored?.values);
  assert(!!stored && !stored.values.includes(ID),
    "and carries NO conflicts_with_id: linking two unreviewed candidates would block both behind "
    + "a decision nobody can make — they sit side by side awaiting review", stored?.values);
  const asked = jevCalls.find((c) => c.keys[0] === "c0");
  assert(!!asked && JSON.stringify(asked.state).includes("only after an offer"),
    "the candidate WAS put to Jev — asking is wider than flagging", asked?.keys);
  jevOverride = {};
}

console.log("\n2e. Agreeing with a candidate does not bury a conflict with an ACTIVE rule");
{
  // Both neighbours are near, and the statement does two things at once: it RESTATES an
  // unreviewed candidate and CONTRADICTS a rule the institution follows. Settling the merge
  // first reinforced the candidate and returned — the active disagreement was never flagged,
  // and the reinforced pair could then promote into use against the live rule with nobody asked.
  modelCalls = []; jevCalls = [];
  modelReply = { candidates: [cand({ type: "INSTITUTION_POLICY", content: "Discuss refunds before the student has an offer.", metadata: {} })] };
  const active = { id: ID, type: "INSTITUTION_POLICY", content: "Refunds are discussed only after an offer.", metadata: {}, source: "admin", confidence: 1, importance: 3, status: "active", reinforce_count: 0, use_count: 0, similarity: 0.88 };
  const nearCandidate = { ...active, id: ID2, content: "Refunds should come up before any offer is made.", source: "extracted", confidence: 0.7, status: "candidate", similarity: 0.95 };
  // nearest = [active, candidate] in that order, so c0 is the active rule: disagrees with it,
  // agrees with the candidate (c1 falls through to the neutral 0).
  jevOverride = { c0: 0.9 };
  reset([
    [h.MATCH_FN, (stmt) => (JSON.stringify(stmt.values).includes("candidate") ? [active, nearCandidate] : [active])],
    [UPDATE_MEMORY, (st) => [h.row({ id: uuidIn(st) })]],
    ...baseRoutes(),
  ]);
  const r = await learn.learnFromCorrection({ kind: "correction", institution_id: INST, message_id: 77 });

  assert(r.reinforced === 0 && r.conflicting === 1,
    "the active conflict wins: nothing reinforced, the statement is flagged", r);
  const linked = all(INSERT_MEMORY).find((st) => st.values.includes("INSTITUTION_POLICY") && !st.values.includes("COUNSELLOR_CORRECTION"));
  assert(!!linked && linked.values.includes(ID) && linked.values.includes("candidate"),
    "and lands as a candidate linked to the ACTIVE rule it contradicts", linked?.values);
  jevOverride = {};
}

console.log("\n3. Ownership: a job claiming the wrong institution writes nothing");
{
  modelCalls = [];
  reset(baseRoutes());
  const r = await learn.learnFromCorrection({ kind: "correction", institution_id: OTHER_INST, message_id: 77 });
  assert(r.created === 0 && count(INSERT_MEMORY) === 0 && modelCalls.length === 0, "mismatched institution → no writes, no model call");
  reset(baseRoutes({ message: { correction: null, review_status: "approved" } }));
  const r2 = await learn.learnFromCorrection({ kind: "correction", institution_id: INST, message_id: 77 });
  assert(r2.created === 0 && count(INSERT_MEMORY) === 0, "no correction text → nothing");
}

console.log("\n4. learnFromFeedback: thumbs act on the memories that shaped the reply, no model call");
{
  modelCalls = [];
  reset([
    ...baseRoutes({ message: { feedback: "positive", feedback_actor: HEX(7), memory_ids: [ID, ID2], correction: null } }),
    [/positive_voters/, (s) => [h.row({ id: uuidIn(s), status: "candidate", source: "extracted" })]],
    [UPDATE_MEMORY, (s) => [h.row({ id: uuidIn(s), status: "candidate", source: "extracted" })]],
  ]);
  const r = await learn.learnFromFeedback({ kind: "feedback", institution_id: INST, message_id: 77 });
  const votes = all(/positive_voters/);
  const reinforces = all(/reinforce_count \+ 1/);
  assert(votes.length === 2 && votes.every((v) => v.values.includes(HEX(7))), "one positive vote per memory, by the hashed actor");
  assert(reinforces.length === 2 && r.reinforced === 2, "each memory reinforced once");
  assert(modelCalls.length === 0 && count(INSERT_MEMORY) === 0, "no model call, nothing new written");

  reset([...baseRoutes({ message: { feedback: "negative", feedback_actor: HEX(8), memory_ids: [ID], correction: null } }),
    [/negative_voters/, () => [h.row({ source: "extracted", source_reference: { actors: [], positive_voters: [], negative_voters: [HEX(8)] } })]]]);
  await learn.learnFromFeedback({ kind: "feedback", institution_id: INST, message_id: 77 });
  assert(count(/negative_voters/) === 1 && count(/reinforce_count \+ 1/) === 0, "negative: one vote, no reinforcement");

  // A thumbs-up on an old reply must not revive the evidence of guidance a human retired:
  // confidence and reinforce_count on a deprecated row would read as ongoing support.
  // Routes are matched first-wins and baseRoutes already ends with a SELECT_MEMORY returning an
  // active row, so the deprecated override has to sit ahead of the spread to be reached at all.
  reset([
    [/positive_voters/, () => [h.row({ status: "deprecated", source: "extracted" })]],
    [SELECT_MEMORY, () => [h.row({ status: "deprecated", source: "extracted" })]],
    ...baseRoutes({ message: { feedback: "positive", feedback_actor: HEX(9), memory_ids: [ID], correction: null } }),
  ]);
  const dep = await learn.learnFromFeedback({ kind: "feedback", institution_id: INST, message_id: 77 });
  assert(count(/reinforce_count \+ 1/) === 0 && dep.reinforced === 0, "positive thumb never reinforces a deprecated memory", dep);

  // Jev attribution: only the guidance the reply actually followed gets the thumbs-down.
  jevCalls = []; jevOverride = { f0: 0.9, f1: 0.1 };
  reset([
    [/"id" in \(\$1, \$2\)/, () => [h.row({ id: ID }), h.row({ id: ID2, content: "Unrelated guidance." })]],
    [/negative_voters/, (s) => [h.row({ id: uuidIn(s), source: "extracted" })]],
    ...baseRoutes({ message: { feedback: "negative", feedback_actor: HEX(8), memory_ids: [ID, ID2], correction: null } }),
  ]);
  await learn.learnFromFeedback({ kind: "feedback", institution_id: INST, message_id: 77 });
  const voted = all(/negative_voters/);
  assert(voted.length === 1 && voted[0]?.values.includes(ID) && !voted[0]?.values.includes(ID2), "only the followed memory is voted against", voted.map((v) => v.values));
  assert(jevCalls.at(-1)?.keys.join() === "f0,f1", "one Jev call with one question per memory");
  jevOverride = {};

  // Jev down → every retrieved memory is voted, as before.
  jev._jevDeps.systemOne = (async () => { throw new Error("jev down"); }) as unknown as typeof jev._jevDeps.systemOne;
  reset([
    [/"id" in \(\$1, \$2\)/, () => [h.row({ id: ID }), h.row({ id: ID2 })]],
    [/negative_voters/, (s) => [h.row({ id: uuidIn(s), source: "extracted" })]],
    ...baseRoutes({ message: { feedback: "negative", feedback_actor: HEX(8), memory_ids: [ID, ID2], correction: null } }),
  ]);
  await learn.learnFromFeedback({ kind: "feedback", institution_id: INST, message_id: 77 });
  assert(count(/negative_voters/) === 2, "Jev failure → falls back to voting every retrieved memory");
  jev._jevDeps.systemOne = jevFake;

  reset(baseRoutes({ message: { feedback: "positive", feedback_actor: null, memory_ids: [ID], correction: null } }));
  await learn.learnFromFeedback({ kind: "feedback", institution_id: INST, message_id: 77 });
  assert(count(UPDATE_MEMORY) === 0, "no actor hash → nothing counted (a vote must be attributable)");

  // ── The anonymous flag is WIRED, not just implemented ──────────────────────
  // voteOnMemory's `anonymous` guard is unit-tested in institution-memory-lifecycle.ts, but that
  // proves nothing about whether this path ever sets it: with `{ anonymous }` deleted from the
  // call below, all 122 assertions across both suites still passed, leaving the widget-visitor
  // vote-spoofing hole (Greptile P1) wide open and green. These two assertions are what fail.
  //
  // The attack: one person opens several widget sessions with different client-supplied
  // fingerprints, each minting a distinct voter hash, and downvotes replies using one memory.
  // Five negatives with no positive would otherwise deprecate the institution's own guidance.
  const fiveVoters = [1, 2, 3, 4, 5].map((n) => HEX(n));
  const atThreshold = (o: Record<string, unknown> = {}) => h.row({
    id: ID, source: "extracted",
    source_reference: { actors: [], positive_voters: [], negative_voters: fiveVoters },
    ...o,
  });

  // Widget visitor: no platform user on the session, identity is the fingerprint they supplied.
  reset([
    [/negative_voters/, () => [atThreshold()]],
    [UPDATE_MEMORY, () => [atThreshold({ flagged_at: new Date() })]],
    ...baseRoutes({
      message: { feedback: "negative", feedback_actor: HEX(15), memory_ids: [ID], correction: null },
      session: { platform_user_id: null, visitor_key: "fingerprint-1" },
    }),
  ]);
  await learn.learnFromFeedback({ kind: "feedback", institution_id: INST, message_id: 77 });
  const guestWrites = all(UPDATE_MEMORY);
  assert(!guestWrites.some((s) => s.values.includes("deprecated")),
    "widget visitor's 5th negative never deprecates learned guidance", guestWrites.map((s) => s.values));
  assert(guestWrites.some((s) => /"flagged_at"/.test(s.text)),
    "…it raises a flag for review instead");

  // Same votes from a signed-in student: one account, one vote, so deprecation is legitimate.
  reset([
    [/negative_voters/, () => [atThreshold()]],
    [UPDATE_MEMORY, () => [atThreshold({ status: "deprecated" })]],
    ...baseRoutes({
      message: { feedback: "negative", feedback_actor: HEX(15), memory_ids: [ID], correction: null },
      session: { platform_user_id: 42 },
    }),
  ]);
  await learn.learnFromFeedback({ kind: "feedback", institution_id: INST, message_id: 77 });
  assert(all(UPDATE_MEMORY).some((s) => s.values.includes("deprecated")),
    "a signed-in student's 5th negative still deprecates — the guard is about anonymity, not votes");
}

console.log("\n5. learnFromConversation: opt-in per widget; candidates only");
{
  modelCalls = [];
  const turns = [
    { id: 1, session_id: 3, role: "user", content: "Can I work while studying?" },
    { id: 2, session_id: 3, role: "assistant", content: "Yes, with limits. What level are you applying for?" },
    { id: 3, session_id: 3, role: "user", content: "Masters." },
    { id: 4, session_id: 3, role: "assistant", content: "Then here is how it usually works…" },
  ].map((t) => ({ ...t, feedback: null, feedback_actor: null, review_status: null, correction: null, review_note: null, memory_ids: [] }));
  reset([[TRANSCRIPT, () => [...turns].reverse()], ...baseRoutes()]);
  let r = await learn.learnFromConversation({ kind: "conversation", institution_id: INST, session_id: 3 });
  assert(modelCalls.length === 0 && r.created === 0, "auto_learn off → no model call");

  modelReply = { candidates: [cand({ type: "STUDENT_CONCERN_PATTERN", content: "Students often ask about working while studying; ask their study level before explaining the rules.", metadata: { concern: "working while studying", approach: "ask level first" } })] };
  reset([[TRANSCRIPT, () => [...turns].reverse()], ...baseRoutes({ config: { auto_learn: true } })]);
  r = await learn.learnFromConversation({ kind: "conversation", institution_id: INST, session_id: 3 });
  const ins = find(INSERT_MEMORY);
  assert(modelCalls.length === 1 && /Student: Can I work/.test(modelCalls[0]!.prompt) && /Counsellor: Yes, with limits/.test(modelCalls[0]!.prompt), "transcript rendered for the extractor");
  assert(r.created === 1 && ins?.values.includes("candidate") && ins.values.includes("extracted"), "stored as an extracted candidate", ins?.values);
  assert(ins?.values.some((v) => typeof v === "string" && v.includes(learn.__test.actorOf(session()) ?? "")), "hashed student recorded as evidence");

  modelReply = { candidates: [
    { type: "GENERAL_CONTEXT", content: "no mentions_person field", confidence: 0.9 },
    cand({ type: "STUDENT_CONCERN_PATTERN", content: "Students often ask about working while studying; ask their study level before explaining the rules.", metadata: { concern: "working while studying", approach: "ask level first" } }),
  ] };
  reset([[TRANSCRIPT, () => [...turns].reverse()], ...baseRoutes({ config: { auto_learn: true } })]);
  r = await learn.learnFromConversation({ kind: "conversation", institution_id: INST, session_id: 3 });
  assert(r.created === 1 && count(INSERT_MEMORY) === 1, "a malformed candidate is dropped on its own; the valid one is still stored", r);
  modelReply = { candidates: "not an array" };
  reset([[TRANSCRIPT, () => [...turns].reverse()], ...baseRoutes({ config: { auto_learn: true } })]);
  r = await learn.learnFromConversation({ kind: "conversation", institution_id: INST, session_id: 3 });
  assert(r.created === 0 && count(INSERT_MEMORY) === 0, "a reply with no candidates array yields nothing");

  reset([[TRANSCRIPT, () => [turns[1]!, turns[0]!]], ...baseRoutes({ config: { auto_learn: true } })]);
  modelCalls = [];
  await learn.learnFromConversation({ kind: "conversation", institution_id: INST, session_id: 3 });
  assert(modelCalls.length === 0, "a one-reply conversation is not worth a model call");
}

await h.finish();
