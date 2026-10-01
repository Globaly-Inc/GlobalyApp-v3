// Learning: turning human signals into memories, under control.
//
// Three inputs, three rules:
//   correction    a counsellor's review. corrected → the correction is stored verbatim as an
//                 active COUNSELLOR_CORRECTION, plus up to two derived rules as candidates;
//                 approved → reinforces the memories the reply used; flagged → votes against them
//   feedback      a student's thumbs → reinforces or votes against the memories that shaped
//                 that reply; no extraction call, nothing new is written
//   conversation  a finished chat (widget has auto_learn on) → the extractor proposes technique
//                 and concern patterns; every one passes the filters below or is discarded
//
// What never becomes memory, enforced in code after the model call: anything naming a person
// (regex + the student's own known names + the extractor's mentions_person flag), anything
// that states a fee/date/score as fact, anything under 0.6 confidence, and anything the
// extractor produces that fails the zod schema. The model's confidence never activates a
// memory; only reinforcement by distinct students or a human does.
//
// Jev (lib/jev.ts) is the independent judge on top of that: it re-decides "names a person",
// "states a fact", "is guidance", and "would a counsellor endorse it" for every candidate,
// checks each survivor against its nearest existing memories for contradictions (a
// contradicting candidate is stored linked and never auto-promotes), and, on a thumbs-down,
// decides which of the retrieved memories the reply actually followed so only those are voted
// against. Without a TYPESAFE_API_KEY every Jev call returns null and the pipeline behaves as
// described in the paragraph above.

import { createChildLogger } from "../../../shared/logger.js";
import { queueService } from "../../../shared/queue/queueService.js";
import { extractJson, isConfigured as isLlmConfigured } from "../../superadmin/data-extraction/lib/llm-client.js";
import * as learnRepo from "../repositories/learning.repository.js";
import { createMemory, embedOrNull, flagConflict, hashActor, voteOnMemory, reinforceMemory } from "./memory.service.js";
import * as memoryRepo from "../repositories/memory.repository.js";
import { judgeCandidate, judgeContradictions, judgeFollowed, type CandidateJudgement } from "../lib/jev.js";
import { recordConversationSignals } from "./conversation-signals.service.js";
import { getProfile } from "./profile.service.js";
import { MEMORY_QUEUES } from "../shared/queues.js";
import {
  CreateMemorySchema, ExtractionCandidateSchema, METADATA_BY_TYPE, FREE_TEXT_METADATA_KEYS, MEMORY_TYPES, TECHNIQUES,
  type Actor, type CreateMemoryInput, type ExtractionCandidate, type LearnJob,
} from "../schemas/memory.schema.js";

const logger = createChildLogger("institution-memory-learning");

const MIN_CONFIDENCE = 0.6;
const MAX_DERIVED_FROM_CORRECTION = 2;
/** Candidates read from one extractor reply, whatever it claims to have found. */
const MAX_CANDIDATES = 8;
/** Nearest memories a candidate is checked against for contradictions and for near-duplicates. */
const CONTRADICTION_NEIGHBOURS = 5;
/**
 * Cosine above which a candidate is the SAME statement as one already stored, differently worded.
 *
 * Dedupe was sha256(normalised content) and nothing else, which caught only an exact repeat. A
 * model paraphrases every time, so "students often ask about post-study work before fees" and
 * "visitors usually raise work rights ahead of cost" were two rows with one actor each — and
 * promotion needs PROMOTION_MIN_ACTORS distinct students on ONE row. The threshold that was
 * meant to require three conversations instead required three conversations that happened to
 * phrase it identically, which is to say it was unreachable.
 *
 * 0.90 is deliberately high: these embeddings put loosely related counselling statements around
 * 0.5-0.7, so this fires on a restatement and not on a neighbour. ponytail: constant, tune on evals.
 */
export const MERGE_SIMILARITY = 0.90;
// Jev probability thresholds. ponytail: constants; tune after evals.
const JEV_PERSON = 0.5;
const JEV_FACT = 0.6;
const JEV_GUIDANCE_MIN = 0.4;
const WORKER: Actor = { kind: "system" };

// ── Publish ──────────────────────────────────────────────────────────────────

/** Fire-and-forget: a dead broker costs a learning opportunity, never a reply or a review. */
export async function enqueueLearning(job: LearnJob): Promise<boolean> {
  try {
    await queueService.publish(MEMORY_QUEUES.LEARN, job);
    return true;
  } catch (err) {
    logger.warn("Learning job not queued", { job, err: String(err) });
    return false;
  }
}

// ── Filters ──────────────────────────────────────────────────────────────────

const PII_RE = [
  /[\w.+-]+@[\w-]+\.[\w.-]+/,                       // email
  /(?:\+?\d[\d\s().-]{7,}\d)/,                       // phone
  /\b[A-Z]{1,2}\d{6,9}\b/,                           // passport / id-like
];
/** A specific figure the institution did not author is a fact, and facts are not learned. */
const FACT_RE = [
  /(?:[$€£₹¥]|\b(?:usd|aud|gbp|eur|nzd|cad|inr)\b)\s?\d/i,   // money
  /\b\d{1,3}(?:,\d{3})+\b/,                                    // 12,000
  /\b(?:ielts|pte|toefl|gpa|atar)\b[^.]{0,20}\d/i,             // test scores
  /\b(?:20\d{2})\b/,                                            // a year
  /\b\d+\s?(?:%|percent|weeks?|months?|days?)\b/i,             // durations / percentages
];

/**
 * Categories a counselling memory must never carry, whoever phrased it.
 *
 * PII_RE catches identifiers — an address, a number, a passport. It does not catch a CATEGORY:
 * "students with depression should be offered a deferral" names nobody, states no figure, is
 * genuinely guidance, and passes every other filter in this file. It is also a health inference
 * about the institution's visitors, stored permanently and injected into future conversations.
 *
 * These are the special categories that attract heightened protection almost everywhere, and the
 * argument for excluding them is not that the sentence is false — it is that a counselling
 * widget has no business deriving standing policy about them from overheard chat. An institution
 * that genuinely wants such a rule can write it by hand, as an admin, with its name on it.
 */
// Stems take \w* rather than a trailing \b — "depress" with a closing boundary matches neither
// "depression" nor "depressed", which is every form anyone actually writes.
const SENSITIVE_CATEGORY_RE = [
  /\b(?:depress\w*|anxiet\w*|mental health|disab\w*|wheelchair|autis\w*|adhd|dyslex\w*|chronic illness|medical condition|pregnan\w*|hiv)\b/i,
  /\b(?:asylum|refugee\w*|undocumented|deport\w*|overstay\w*)\b/i,
  /\b(?:muslim\w*|christian\w*|hindu\w*|buddhist\w*|jewish|sikh\w*|religio\w*|caste|ethnic\w*|race|racial)\b/i,
  /\b(?:gay|lesbian\w*|bisexual\w*|transgender\w*|lgbt\w*|sexual orientation)\b/i,
  /\b(?:bankrupt\w*|in debt|cannot afford|poverty|low.income|financial hardship)\b/i,
];

export type RejectReason = "schema" | "confidence" | "mentions_person" | "pii" | "known_name" | "fact_like" | "not_guidance" | "metadata" | "sensitive_category";

/**
 * Returns the memory input, or why the candidate was thrown away. Pure.
 *
 * With a Jev judgement the decision is Jev's, not the extractor's: a person-mention or a fact
 * the extractor missed is caught, and the stored confidence is the LOWER of the extractor's
 * and Jev's endorsement, so one optimistic model cannot inflate the other.
 */
/** One alternation for every known name — built once so content and metadata use the SAME test. */
function namePattern(knownNames: string[]): RegExp | null {
  const escaped = knownNames.filter(Boolean).map((n) => n.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return escaped.length ? new RegExp(`\\b(?:${escaped.join("|")})\\b`) : null;
}

/** Free-text metadata values, flattened to one string for filtering. Structured keys (ids, enums,
 *  dates, urls, country codes) are skipped — see FREE_TEXT_METADATA_KEYS. */
function metadataFreeText(metadata: Record<string, unknown>): string {
  const out: string[] = [];
  for (const [key, value] of Object.entries(metadata)) {
    if (!FREE_TEXT_METADATA_KEYS.has(key)) continue;
    if (typeof value === "string") out.push(value);
    else if (Array.isArray(value)) for (const v of value) if (typeof v === "string") out.push(v);
  }
  return out.join(" ");
}

export function evaluateCandidate(
  c: ExtractionCandidate,
  knownNames: string[],
  opts: { allowFacts?: boolean; judgement?: CandidateJudgement | null } = {},
): { ok: true; input: CreateMemoryInput; confidence: number } | { ok: false; reason: RejectReason } {
  const j = opts.judgement ?? null;
  // GENERAL_KNOWLEDGE is the one type whose whole point is a fact, so it carries its own licence
  // rather than needing the caller to pass allowFacts — and it pays for that licence by never
  // auto-promoting (NEVER_AUTO_PROMOTES). It is also exempt from the is_technique floor, which
  // exists to keep non-guidance out of the TECHNIQUE types and would reject every fact by design.
  const factual = c.type === "GENERAL_KNOWLEDGE";
  const allowFacts = opts.allowFacts || factual;
  if (c.mentions_person || (j && j.mentions_person >= JEV_PERSON)) return { ok: false, reason: "mentions_person" };
  if (j && !allowFacts && j.is_fact >= JEV_FACT) return { ok: false, reason: "fact_like" };
  if (j && !factual && j.is_technique < JEV_GUIDANCE_MIN) return { ok: false, reason: "not_guidance" };
  const confidence = j ? Math.min(c.confidence, j.endorsed) : c.confidence;
  if (confidence < MIN_CONFIDENCE) return { ok: false, reason: "confidence" };
  if (PII_RE.some((re) => re.test(c.content))) return { ok: false, reason: "pii" };
  // Checked on content AND on the free-text metadata below, because a concern or an approach is
  // exactly where a health or immigration category would land.
  if (SENSITIVE_CATEGORY_RE.some((re) => re.test(c.content))) return { ok: false, reason: "sensitive_category" };
  if (namePattern(knownNames)?.test(c.content.toLowerCase())) return { ok: false, reason: "known_name" };
  if (!allowFacts && FACT_RE.some((re) => re.test(c.content))) return { ok: false, reason: "fact_like" };
  const metadata = METADATA_BY_TYPE[c.type].safeParse(c.metadata);
  if (!metadata.success) return { ok: false, reason: "metadata" };
  const freeText = metadataFreeText(metadata.data);
  if (freeText) {
    if (PII_RE.some((re) => re.test(freeText))) return { ok: false, reason: "pii" };
    if (SENSITIVE_CATEGORY_RE.some((re) => re.test(freeText))) return { ok: false, reason: "sensitive_category" };
    if (namePattern(knownNames)?.test(freeText.toLowerCase())) return { ok: false, reason: "known_name" };
  }
  // Metadata gets the same privacy filters as content, on the free-text keys only. The shape
  // check above inspects no text, and memory reads return metadata verbatim to the portal — so
  // without this a student's name in `concern`, or the reply quoted into `example`, is stored
  // and outlives the conversation (Greptile). Not FACT_RE: metadata legitimately holds dates,
  // urls and codes, and "no figures" is a content-quality rule, not a privacy one.
  const parsed = CreateMemorySchema.safeParse({ type: c.type, content: c.content, metadata: metadata.data, importance: 3 });
  return parsed.success ? { ok: true, input: parsed.data, confidence } : { ok: false, reason: "schema" };
}

// ── Extractor ────────────────────────────────────────────────────────────────

const SYSTEM = [
  "You distil COUNSELLING TECHNIQUES from an education counsellor's conversation for one institution.",
  "You never store facts, answers, or anything about an individual student. Output JSON only:",
  `{"candidates":[{"type":<one of ${MEMORY_TYPES.join("|")}>,"content":<one sentence, max 400 chars>,` +
  `"metadata":<object per type>,"confidence":<0..1>,"mentions_person":<true|false>}]}`,
  "",
  "Rules:",
  "- A candidate describes HOW to counsel (when to ask first, how to explain eligibility, how to compare, " +
  "when to withhold a recommendation, what students commonly worry about and how counsellors address it). " +
  "It must apply to future students, not to this one.",
  "- Never include a name, a nationality, a grade, a score, a fee, a date, a deadline, or any figure. If the " +
  "only useful thing is a fact, output no candidate.",
  "- Never produce a rule about health, disability, mental health, immigration status, religion, ethnicity, " +
  "caste, sexuality, or financial hardship. Those are the institution's to decide deliberately, not yours " +
  "to infer from a conversation.",
  "- RESPONSE_PATTERN metadata: {technique: one of " + TECHNIQUES.join("|") + ", trigger: <when to use it>}.",
  "- STUDENT_CONCERN_PATTERN metadata: {concern, approach}. TERMINOLOGY metadata: {term, meaning}.",
  "- Confidence is how sure you are that a human counsellor at this institution would endorse it.",
  "- Zero candidates is a normal answer. Prefer none over weak.",
].join("\n");

function transcriptText(turns: Array<{ role: string; content: string }>): string {
  return turns.map((t) => `${t.role === "user" ? "Student" : "Counsellor"}: ${t.content.slice(0, 1200)}`).join("\n");
}

/**
 * Parsed per candidate, not as one batch: the fallback model occasionally emits one malformed
 * entry, and throwing away four good candidates for it is the wrong trade. Anything that
 * fails the schema is dropped and its path logged; nothing is repaired.
 */
async function extractCandidates(prompt: string): Promise<ExtractionCandidate[]> {
  if (!isLlmConfigured()) return [];
  const raw = await extractJson<{ candidates?: unknown }>({ system: SYSTEM, prompt, tier: "lite", noCache: true });
  const list = Array.isArray(raw?.candidates) ? raw.candidates.slice(0, MAX_CANDIDATES) : [];
  const kept: ExtractionCandidate[] = [];
  const dropped: string[] = [];
  for (const item of list) {
    const parsed = ExtractionCandidateSchema.safeParse(item);
    if (parsed.success) kept.push(parsed.data);
    else dropped.push(parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; "));
  }
  if (dropped.length) logger.warn("Extractor candidates failed schema; dropped", { dropped, kept: kept.length });
  return kept;
}

// ── Jobs ─────────────────────────────────────────────────────────────────────

export interface LearnResult {
  created: number;
  reinforced: number;
  /** Stored as candidates linked to the memory they contradict; a human resolves them. */
  conflicting: number;
  rejected: Partial<Record<RejectReason | "previously_deprecated", number>>;
}
const result = (): LearnResult => ({ created: 0, reinforced: 0, conflicting: 0, rejected: {} });
const reject = (r: LearnResult, reason: keyof LearnResult["rejected"]) => { r.rejected[reason] = (r.rejected[reason] ?? 0) + 1; };

async function storeCandidates(
  r: LearnResult,
  candidates: ExtractionCandidate[],
  ctx: { institutionId: number; knownNames: string[]; evidenceActor: string | null; sourceReference: { message_id?: number; session_id?: number }; source: "extracted" | "correction"; max?: number },
) {
  let stored = 0;
  for (const c of candidates) {
    // Cap the SURVIVORS, not the raw list: a rejected candidate must not use up a slot.
    if (ctx.max !== undefined && stored >= ctx.max) break;
    const judgement = await judgeCandidate(c.content, c.type);
    const verdict = evaluateCandidate(c, ctx.knownNames, { judgement });
    if (!verdict.ok) { reject(r, verdict.reason); logger.info("Candidate rejected", { institutionId: ctx.institutionId, reason: verdict.reason, type: c.type, jev: !!judgement }); continue; }

    // One embedding, and now one vector query, serve three things: the near-duplicate merge, the
    // contradiction check, and the insert.
    const embedding = await embedOrNull(verdict.input.type, verdict.input.content);
    // TWO scoped queries, not one widened one. A single `statuses: ["active","candidate"]` fetch
    // shares its five slots between both kinds, so five nearer CANDIDATES can push a contradicting
    // ACTIVE rule out of the window entirely — the statement is then stored unlinked and can be
    // promoted into use against a rule the institution actually follows. The active set has to be
    // guaranteed, and the only way to guarantee it is to ask for it on its own.
    const [activeNearest, mergeNearest] = embedding
      ? await Promise.all([
          // Active only (the function's default) — the set a conflict may be FLAGGED against.
          memoryRepo.match(embedding, ctx.institutionId, { count: CONTRADICTION_NEIGHBOURS }),
          // Plus candidates — the wider set the merge may fold into. Two paraphrases of one
          // unreviewed observation are the case that exists for, and both are candidates.
          memoryRepo.match(embedding, ctx.institutionId, { count: CONTRADICTION_NEIGHBOURS, statuses: ["active", "candidate"] }),
        ])
      : [[], []];

    // Deduped by id: the two windows overlap on active rows, and Jev should see each statement once.
    const nearest = [...new Map([...activeNearest, ...mergeNearest].map((m) => [m.id, m])).values()];

    // CONTRADICTION IS CHECKED FIRST, and the order is the whole safety of this block.
    //
    // High similarity does not mean agreement. "Discuss refunds before the student has an offer"
    // and "Refunds are discussed only after an offer" sit around 0.9 apart because they share
    // almost every word — and mean the opposite. Merging on similarity before asking whether the
    // two agree would have silently reinforced the memory that says the reverse, turning a
    // disagreement into evidence for the thing being disagreed with. The existing conflict test
    // caught exactly that, with exactly that pair.
    const disagrees = embedding ? await contradictions(verdict.input.content, nearest) : new Set<string>();

    // A restatement is evidence; a disagreement never is. Every neighbour this could merge into
    // has been asked, so a contradicted one is excluded here whatever its status.
    const duplicate = mergeNearest.find((m) =>
      m.type === verdict.input.type && m.similarity >= MERGE_SIMILARITY && !disagrees.has(m.id));
    if (duplicate) {
      const existing = await memoryRepo.findById(duplicate.id, ctx.institutionId);
      if (existing) {
        await reinforceMemory(existing, WORKER, ctx.evidenceActor ?? null);
        r.reinforced++; stored++;
        logger.info("Candidate merged into a near-duplicate", {
          institutionId: ctx.institutionId, memoryId: duplicate.id, similarity: Number(duplicate.similarity.toFixed(3)),
        });
        continue;
      }
    }

    // FLAGGING is narrower than asking. A conflict link blocks auto-promotion until a human
    // clears it, which only makes sense against something the institution actually follows —
    // linking two unreviewed candidates would block both behind a decision nobody can make. So a
    // contradicted CANDIDATE is simply not merged into (above) and lands as its own candidate
    // row; the pair then sit side by side awaiting review, which is the honest outcome.
    const conflictsWith = activeNearest.find((m) => disagrees.has(m.id))?.id ?? null;
    if (conflictsWith) {
      const flagged = await flagConflict({
        institutionId: ctx.institutionId, input: verdict.input, conflictsWithId: conflictsWith, confidence: verdict.confidence,
        actor: WORKER, evidenceActor: ctx.evidenceActor, sourceReference: ctx.sourceReference, embedding,
      });
      if (flagged) { r.conflicting++; stored++; }
      continue;
    }

    const out = await createMemory({
      institutionId: ctx.institutionId, input: verdict.input, source: ctx.source, actor: WORKER,
      confidence: verdict.confidence, evidenceActor: ctx.evidenceActor, sourceReference: ctx.sourceReference,
      asCandidate: true, // derived rules are always reviewed by a human or reinforced by students
      embedding,
    });
    if (out.outcome === "created") { r.created++; stored++; }
    else if (out.outcome === "rejected") reject(r, "previously_deprecated");
    else { r.reinforced++; stored++; }
  }
}

/** The id of the nearest active memory the statement contradicts, per Jev; null when none or when Jev is off. */
async function contradictions(
  content: string,
  neighbours: memoryRepo.MemoryMatch[],
): Promise<Set<string>> {
  // Asked of EVERY neighbour, candidates included. The question "do these two disagree" has to
  // cover anything this statement could be merged into, and the merge below accepts candidates.
  // Asking only about active rows left a gap: a statement contradicting an unreviewed candidate
  // raised no conflict, so the near-duplicate merge treated it as a restatement and reinforced
  // the memory saying the opposite — the exact failure the ordering was meant to prevent,
  // arriving through the candidate path instead.
  if (!neighbours.length) return new Set();
  const hits = await judgeContradictions(content, neighbours.map((m) => ({ id: m.id, content: m.content })));
  return hits ?? new Set();
}

const actorOf = (s: learnRepo.LearnSession) => s.platform_user_id ? hashActor(`u:${s.platform_user_id}`) : s.visitor_key ? hashActor(`v:${s.visitor_key}`) : null;

/** A counsellor reviewed a reply. Corrected: store the correction, derive up to two rules as
 *  candidates. Approved / flagged: reinforce or vote against the memories the reply used. */
export async function learnFromCorrection(job: Extract<LearnJob, { kind: "correction" }>): Promise<LearnResult> {
  const r = result();
  const message = await learnRepo.findMessage(job.message_id);
  if (!message || message.role !== "assistant" || !message.review_status) return r;
  const session = await learnRepo.findSession(message.session_id);
  const owner = session && await learnRepo.institutionForSession(session);
  if (!session || !owner || owner.institutionId !== job.institution_id) {
    logger.warn("Correction job does not belong to the claimed institution; ignored", { job });
    return r;
  }
  // A counsellor is one actor like a student is, so their approval counts once toward
  // promotion and their flag once toward the vote threshold. Human-authored memories are
  // still only flagged by votes, never deprecated — the same rule as for students.
  const reviewerHash = message.reviewed_by ? hashActor(`c:${message.reviewed_by}`) : null;
  if (message.review_status !== "corrected") {
    if (!reviewerHash) return r;
    for (const id of message.memory_ids) {
      const m = await memoryRepo.findById(id, owner.institutionId);
      if (!m || m.status === "deleted") continue;
      if (message.review_status === "approved") {
        if (await voteOnMemory(id, owner.institutionId, "positive", reviewerHash) === "duplicate") continue;
        await reinforceMemory(m, { kind: "counsellor", id: reviewerHash }, reviewerHash);
        r.reinforced++;
      } else {
        await voteOnMemory(id, owner.institutionId, "negative", reviewerHash);
      }
    }
    return r;
  }
  if (!message.correction) return r;
  const knownNames = await learnRepo.knownNames(session, owner.config);
  const reviewer: Actor = { kind: "counsellor", ...(reviewerHash ? { id: reviewerHash } : {}) };

  // 1. The correction itself, verbatim and active. A human wrote it, so facts are allowed and
  //    endorsement is not in question — Jev is asked only whether it names a person.
  const correctionText = message.correction.slice(0, 600);
  const j = await judgeCandidate(correctionText, "COUNSELLOR_CORRECTION");
  const verdict = evaluateCandidate({
    type: "COUNSELLOR_CORRECTION", content: correctionText, confidence: 1, mentions_person: false,
    // message_id only. The reply being corrected can repeat the student's own name or contact
    // details, and only `content` is PII-filtered — a copy here would outlive the conversation.
    metadata: { message_id: message.id },
  }, knownNames, { allowFacts: true, judgement: j ? { ...j, is_technique: 1, endorsed: 1 } : null });
  if (verdict.ok) {
    const out = await createMemory({ institutionId: owner.institutionId, input: verdict.input, source: "correction", actor: reviewer, sourceReference: { message_id: message.id, session_id: session.id } });
    if (out.outcome === "created") r.created++; else r.reinforced++;
  } else reject(r, verdict.reason);

  // 2. Rules the correction implies, as candidates for the institution to approve.
  const question = await learnRepo.findQuestionFor(message);
  const prompt = [
    question ? `Student asked:\n${question.slice(0, 1200)}` : "",
    `Counsellor AI replied:\n${message.content.slice(0, 2000)}`,
    `A human counsellor corrected it to:\n${message.correction.slice(0, 2000)}`,
    message.review_note ? `Their note: ${message.review_note}` : "",
    `\nWhat general rule or technique, if any, does the correction teach? At most ${MAX_DERIVED_FROM_CORRECTION} candidates.`,
  ].filter(Boolean).join("\n\n");
  const candidates = (await extractCandidates(prompt).catch((err) => { logger.warn("Extractor failed", { err: String(err) }); return []; }))
    .filter((c) => c.type !== "COUNSELLOR_CORRECTION");
  await storeCandidates(r, candidates, { institutionId: owner.institutionId, knownNames, evidenceActor: actorOf(session), sourceReference: { message_id: message.id, session_id: session.id }, source: "correction", max: MAX_DERIVED_FROM_CORRECTION });
  return r;
}

/** A student thumbed a reply: reinforce or vote against the memories that shaped it. */
export async function learnFromFeedback(job: Extract<LearnJob, { kind: "feedback" }>): Promise<LearnResult> {
  const r = result();
  const message = await learnRepo.findMessage(job.message_id);
  if (!message || !message.feedback || !message.feedback_actor || !message.memory_ids.length) return r;
  const session = await learnRepo.findSession(message.session_id);
  const owner = session && await learnRepo.institutionForSession(session);
  if (!owner || owner.institutionId !== job.institution_id) return r;

  // A thumbs-down should land on the guidance the reply actually followed, not on everything
  // that happened to be retrieved. Jev decides; without it, every retrieved memory is voted.
  let targets = message.memory_ids;
  if (message.feedback === "negative") {
    const memories = await memoryRepo.findByIds(message.memory_ids, owner.institutionId);
    const followed = await judgeFollowed(message.content, memories.map((m) => ({ id: m.id, content: m.content })));
    if (followed) targets = message.memory_ids.filter((id) => followed.has(id));
  }

  // No platform user on the session means a widget visitor, whose identity is a fingerprint they
  // supply — so their thumbs-down flags for review rather than deprecating. See voteOnMemory.
  const anonymous = !session.platform_user_id;

  for (const id of targets) {
    if (message.feedback === "positive") {
      const outcome = await voteOnMemory(id, owner.institutionId, "positive", message.feedback_actor);
      if (outcome === "duplicate") continue;
      const m = await memoryRepo.findById(id, owner.institutionId);
      // Candidates and active rows accrue evidence; a deprecated one does not. A late thumb on an
      // old reply must not read as ongoing support for guidance a human deliberately retired.
      if (m && (m.status === "active" || m.status === "candidate")) { await reinforceMemory(m, { kind: "student", id: message.feedback_actor }, message.feedback_actor); r.reinforced++; }
    } else {
      await voteOnMemory(id, owner.institutionId, "negative", message.feedback_actor, { anonymous });
    }
  }
  return r;
}

/**
 * A finished conversation. Two independent things happen here, and they are gated differently.
 *
 *   SIGNALS are the institution's own analytics about its funnel — the journey shape and what
 *   became of it. They are recorded ALWAYS. Gating them on auto_learn would mean an institution
 *   that declined to have its counsellor learn also lost the ability to see how its visitors
 *   convert, which are unrelated choices.
 *
 *   LEARNING writes guidance the counsellor will follow, so it stays behind the opt-in.
 */
export async function learnFromConversation(job: Extract<LearnJob, { kind: "conversation" }>): Promise<LearnResult> {
  const r = result();
  const session = await learnRepo.findSession(job.session_id);
  const owner = session && await learnRepo.institutionForSession(session);
  if (!session || !owner || owner.institutionId !== job.institution_id) return r;

  // Never awaited for its result and never allowed to fail the job: an insight is worth less
  // than the learning that runs after it.
  await recordConversationSignals({ institutionId: owner.institutionId, session, config: owner.config })
    .catch((err) => logger.warn("Signals failed", { sessionId: session.id, err: String(err) }));

  // Both opt-ins, either is enough — the per-widget column and the institution-wide Rack toggle.
  // This check used to live in the publisher; moving it here is what let signals run regardless,
  // and the Rack half has to come with it or turning learning on in the portal does nothing.
  const rack = await getProfile(owner.institutionId).catch(() => null);
  if (!owner.config.auto_learn && !rack?.profile.learning.auto_learn) {
    logger.info("auto_learn off; conversation not learned from", { sessionId: session.id });
    return r;
  }

  const turns = await learnRepo.findTranscript(session.id);
  if (turns.filter((t) => t.role === "assistant").length < 2) return r; // nothing to learn from a greeting
  const knownNames = await learnRepo.knownNames(session, owner.config);
  // Off by default. Facts are the costliest thing this system can get wrong, so an institution
  // opts in to having them proposed at all — and even then every one waits for a human.
  const learnFacts = !!rack?.profile.learning.learn_general_knowledge;
  const prompt = [
    `Conversation:\n${transcriptText(turns)}`,
    "",
    "Which counselling techniques or common concerns here would help future conversations at this institution?",
    learnFacts
      ? "You may ALSO propose at most one GENERAL_KNOWLEDGE candidate: a fact about studying abroad that is "
        + "true beyond this one visitor and that a counsellor here would want remembered — \"Australian student "
        + "visas generally require proof of funds\", never \"this student has the funds\". Its metadata is "
        + "{topic, destination_country?}. If the conversation contains no such fact, propose none."
      : "",
  ].filter(Boolean).join("\n");
  const candidates = (await extractCandidates(prompt).catch((err) => { logger.warn("Extractor failed", { err: String(err) }); return []; }))
    .filter((c) => c.type !== "COUNSELLOR_CORRECTION")
    // Enforced here as well as asked for in the prompt: a model offering a fact it was never
    // invited to propose is exactly what the stored rule has to catch, and this one admits figures.
    .filter((c) => learnFacts || c.type !== "GENERAL_KNOWLEDGE");
  await storeCandidates(r, candidates, { institutionId: owner.institutionId, knownNames, evidenceActor: actorOf(session), sourceReference: { session_id: session.id }, source: "extracted" });
  return r;
}

/** Test seam only. */
export const __test = { actorOf };

export async function runLearnJob(job: LearnJob): Promise<LearnResult> {
  // Read the signal BEFORE the job runs: the stamp below must record "this version was learned
  // from", not "a job finished". Captured early on purpose — if the signal changes between here
  // and the handler's own read, the guard simply misses and the sweep re-enqueues, which is the
  // safe direction (learn twice, never skip).
  const observed = "message_id" in job ? await learnRepo.findMessage(job.message_id) : undefined;
  const result = await (async (): Promise<LearnResult> => {
    switch (job.kind) {
      case "correction": return learnFromCorrection(job);
      case "feedback": return learnFromFeedback(job);
      case "conversation": return learnFromConversation(job);
    }
  })();
  // Only after the job actually ran — a throw above skips this, leaving the signal for the sweep.
  // Best-effort: the learning already happened, and failing here would re-run it forever.
  //
  // Stamps ONLY this job's own signal. A thumb and a review are independent signals on the same
  // message; marking the whole row would hide whichever one had not been learned from yet, and it
  // would never be recovered (Greptile). "conversation" carries a session, not a message, so it
  // has no marker at all and stays unrecoverable — a known gap, not an oversight.
  const marker: learnRepo.LearnedMarker | null =
    job.kind === "feedback" ? "feedback" : job.kind === "correction" ? "review" : null;
  if (marker && observed && "message_id" in job) {
    const stamped = await learnRepo.markLearned(job.message_id, marker, observed)
      .catch((err) => { logger.warn("Could not stamp learned marker", { messageId: job.message_id, marker, err: String(err) }); return 0; });
    // 0 = the signal changed while this job ran, so a newer job owns it. Leaving the marker null
    // is the point: the sweep recovers the new signal even if that newer job never reached the broker.
    if (!stamped) logger.info("Signal changed while learning — marker left for the newer job", { messageId: job.message_id, marker });
  }
  return result;
}

/** How long a published job is presumed still in flight before the sweep treats it as lost. */
const LEARN_RECOVERY_GRACE_MIN = Number(process.env.LEARN_RECOVERY_GRACE_MIN) || 15;
/** One sweep's worth — a backlog drains over successive hourly runs rather than in one burst. */
const LEARN_RECOVERY_BATCH = 200;

/**
 * Re-enqueue learning signals that were accepted and stored but whose job never reached the
 * broker. enqueueLearning is fire-and-forget by design (a dead broker must never fail a user's
 * write), and the callers persist the signal on the row before enqueuing — so an outage loses
 * only the replay, and this is what replays it once the broker is back (Greptile P2).
 *
 * Mirrors the enqueue conditions in learning-signals.service.ts exactly: a review is learnable
 * when it is "corrected" or the reply used memories; a thumb only when the reply used memories.
 * Keep the two in step — a row this sweep enqueues but that path would not is a row the worker
 * will find nothing to do with, and it would be picked up again on every sweep forever.
 */
export async function sweepUnlearnedSignals(): Promise<{ found: number; requeued: number }> {
  const rows = await learnRepo.findUnlearnedSignals(LEARN_RECOVERY_GRACE_MIN, LEARN_RECOVERY_BATCH);
  let requeued = 0;
  for (const row of rows) {
    const usedMemories = row.memory_ids.length > 0;
    // BOTH signals are considered, independently. Picking one kind per row meant that when a
    // message carried an unlearned review AND an unlearned thumb, only the review was ever
    // enqueued and the thumb was dropped (Greptile).
    const pending: Array<{ kind: "correction" | "feedback"; marker: learnRepo.LearnedMarker; learnable: boolean }> = [];
    if (row.review_status && !row.review_learned_at) {
      pending.push({ kind: "correction", marker: "review", learnable: row.review_status === "corrected" || usedMemories });
    }
    if (row.feedback && !row.feedback_learned_at) {
      pending.push({ kind: "feedback", marker: "feedback", learnable: usedMemories });
    }

    for (const p of pending) {
      // Nothing to learn from (a bare thumb on a reply that used no memories, an approved review
      // that used none). Stamp that ONE marker so the sweep stops reconsidering it every run —
      // the signal itself is kept on the row either way.
      if (!p.learnable) {
        await learnRepo.markLearned(row.id, p.marker, row).catch(() => { /* retried next sweep */ });
        continue;
      }
      const session = await learnRepo.findSession(row.session_id);
      const owner = session && await learnRepo.institutionForSession(session);
      // Not an institution-owned chat (or its session/widget is gone): nothing to learn into.
      // Stamped, or these rows sit at the head of the oldest-first batch forever and, once a
      // batch's worth accumulate, nothing behind them is ever recovered.
      if (!owner) { await learnRepo.markLearned(row.id, p.marker, row).catch(() => { /* retried next sweep */ }); continue; }
      if (await enqueueLearning({ kind: p.kind, institution_id: owner.institutionId, message_id: row.id })) requeued++;
    }
  }
  if (rows.length) logger.info("Learning recovery sweep", { found: rows.length, requeued });
  return { found: rows.length, requeued };
}
