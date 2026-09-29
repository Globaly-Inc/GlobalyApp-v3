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
import { MEMORY_QUEUES } from "../shared/queues.js";
import {
  CreateMemorySchema, ExtractionCandidateSchema, METADATA_BY_TYPE, MEMORY_TYPES, TECHNIQUES,
  type Actor, type CreateMemoryInput, type ExtractionCandidate, type LearnJob,
} from "../schemas/memory.schema.js";

const logger = createChildLogger("institution-memory-learning");

const MIN_CONFIDENCE = 0.6;
const MAX_DERIVED_FROM_CORRECTION = 2;
/** Candidates read from one extractor reply, whatever it claims to have found. */
const MAX_CANDIDATES = 8;
/** Nearest active memories a candidate is checked against for contradictions. */
const CONTRADICTION_NEIGHBOURS = 5;
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

export type RejectReason = "schema" | "confidence" | "mentions_person" | "pii" | "known_name" | "fact_like" | "not_guidance" | "metadata";

/**
 * Returns the memory input, or why the candidate was thrown away. Pure.
 *
 * With a Jev judgement the decision is Jev's, not the extractor's: a person-mention or a fact
 * the extractor missed is caught, and the stored confidence is the LOWER of the extractor's
 * and Jev's endorsement, so one optimistic model cannot inflate the other.
 */
export function evaluateCandidate(
  c: ExtractionCandidate,
  knownNames: string[],
  opts: { allowFacts?: boolean; judgement?: CandidateJudgement | null } = {},
): { ok: true; input: CreateMemoryInput; confidence: number } | { ok: false; reason: RejectReason } {
  const j = opts.judgement ?? null;
  if (c.mentions_person || (j && j.mentions_person >= JEV_PERSON)) return { ok: false, reason: "mentions_person" };
  if (j && !opts.allowFacts && j.is_fact >= JEV_FACT) return { ok: false, reason: "fact_like" };
  if (j && j.is_technique < JEV_GUIDANCE_MIN) return { ok: false, reason: "not_guidance" };
  const confidence = j ? Math.min(c.confidence, j.endorsed) : c.confidence;
  if (confidence < MIN_CONFIDENCE) return { ok: false, reason: "confidence" };
  if (PII_RE.some((re) => re.test(c.content))) return { ok: false, reason: "pii" };
  const lower = c.content.toLowerCase();
  if (knownNames.some((n) => new RegExp(`\\b${n.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(lower))) {
    return { ok: false, reason: "known_name" };
  }
  if (!opts.allowFacts && FACT_RE.some((re) => re.test(c.content))) return { ok: false, reason: "fact_like" };
  const metadata = METADATA_BY_TYPE[c.type].safeParse(c.metadata);
  if (!metadata.success) return { ok: false, reason: "metadata" };
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

    // One embedding serves both the contradiction check and the insert.
    const embedding = await embedOrNull(verdict.input.type, verdict.input.content);
    const conflictsWith = embedding ? await contradictedMemory(ctx.institutionId, verdict.input.content, embedding) : null;
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
async function contradictedMemory(institutionId: number, content: string, embedding: number[]): Promise<string | null> {
  const nearest = await memoryRepo.match(embedding, institutionId, { count: CONTRADICTION_NEIGHBOURS });
  if (!nearest.length) return null;
  const hits = await judgeContradictions(content, nearest.map((m) => ({ id: m.id, content: m.content })));
  if (!hits?.size) return null;
  // Nearest first: `nearest` is already ordered by cosine.
  return nearest.find((m) => hits.has(m.id))?.id ?? null;
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
    metadata: { message_id: message.id, original_excerpt: message.content.slice(0, 600) },
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

  for (const id of targets) {
    if (message.feedback === "positive") {
      const outcome = await voteOnMemory(id, owner.institutionId, "positive", message.feedback_actor);
      if (outcome === "duplicate") continue;
      const m = await memoryRepo.findById(id, owner.institutionId);
      if (m && m.status !== "deleted") { await reinforceMemory(m, { kind: "student", id: message.feedback_actor }, message.feedback_actor); r.reinforced++; }
    } else {
      await voteOnMemory(id, owner.institutionId, "negative", message.feedback_actor);
    }
  }
  return r;
}

/** A finished conversation on a widget with auto_learn on: propose patterns as candidates. */
export async function learnFromConversation(job: Extract<LearnJob, { kind: "conversation" }>): Promise<LearnResult> {
  const r = result();
  const session = await learnRepo.findSession(job.session_id);
  const owner = session && await learnRepo.institutionForSession(session);
  if (!session || !owner || owner.institutionId !== job.institution_id) return r;
  if (!owner.config.auto_learn) { logger.info("auto_learn off; conversation skipped", { sessionId: session.id }); return r; }

  const turns = await learnRepo.findTranscript(session.id);
  if (turns.filter((t) => t.role === "assistant").length < 2) return r; // nothing to learn from a greeting
  const knownNames = await learnRepo.knownNames(session, owner.config);
  const prompt = `Conversation:\n${transcriptText(turns)}\n\nWhich counselling techniques or common concerns here would help future conversations at this institution?`;
  const candidates = await extractCandidates(prompt).catch((err) => { logger.warn("Extractor failed", { err: String(err) }); return []; });
  await storeCandidates(r, candidates.filter((c) => c.type !== "COUNSELLOR_CORRECTION"), { institutionId: owner.institutionId, knownNames, evidenceActor: actorOf(session), sourceReference: { session_id: session.id }, source: "extracted" });
  return r;
}

/** Test seam only. */
export const __test = { actorOf };

export async function runLearnJob(job: LearnJob): Promise<LearnResult> {
  switch (job.kind) {
    case "correction": return learnFromCorrection(job);
    case "feedback": return learnFromFeedback(job);
    case "conversation": return learnFromConversation(job);
  }
}
