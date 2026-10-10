// Typed decisions for the learning pipeline, via TypeSafe's Jev (@typesafe-ai/sdk).
//
// Jev answers yes/no questions about a piece of state with a probability, in ~100 ms, and
// is not the model that wrote the candidate — so it is the independent judge of what the
// extractor proposes. Three decisions live here:
//   judgeCandidate       does it name a person, state a fact, describe a technique, and would a
//                        counsellor endorse it — the gate before anything becomes a candidate
//   judgeContradictions  does the new statement contradict any of the nearest existing memories
//   judgeFollowed        which of the memories retrieved for a reply did the reply actually
//                        follow — so a thumbs-down votes against the right ones
//
// Every function returns null when Jev is not configured or the call fails; callers then fall
// back to the extractor's own flags and the regex filters. The key stays server-side
// (TYPESAFE_API_KEY); nothing here is reachable from a browser.

import { TypeSafeClient, noul, type Questions, type SystemOneRequest, type SystemOneResult } from "@typesafe-ai/sdk";
import { config } from "../../../config.js";
import { createChildLogger } from "../../../shared/logger.js";

const logger = createChildLogger("institution-memory-jev");

/** Per-attempt timeout. Jev is fast; a slow answer is worth less than moving on. */
const TIMEOUT_MS = 5_000;
const MAX_STATE_CHARS = 6_000;

export const isJevConfigured = (): boolean => !!config.TYPESAFE_API_KEY;

let client: TypeSafeClient | null = null;
function getClient(): TypeSafeClient {
  if (!client) client = new TypeSafeClient({ apiKey: config.TYPESAFE_API_KEY, timeout: TIMEOUT_MS, logLevel: "warn" });
  return client;
}

/** Test seam, same shape as llm-client's _llmDeps. */
export const _jevDeps = {
  systemOne: <const Q extends Questions>(request: SystemOneRequest<Q>): Promise<SystemOneResult<Q>> =>
    getClient().systemOne(request, { timeout: TIMEOUT_MS }),
};

async function ask<const Q extends Questions>(label: string, request: SystemOneRequest<Q>): Promise<SystemOneResult<Q>["answers"] | null> {
  if (!isJevConfigured()) return null;
  try {
    const { answers } = await _jevDeps.systemOne(request);
    return answers;
  } catch (err) {
    logger.warn(`Jev ${label} failed; falling back`, { err: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

const clip = (s: string) => s.slice(0, MAX_STATE_CHARS);

// ── Candidate gate ───────────────────────────────────────────────────────────

/** Probabilities, 0–1. */
export interface CandidateJudgement {
  mentions_person: number;
  is_fact: number;
  is_technique: number;
  endorsed: number;
}

export async function judgeCandidate(content: string, type: string): Promise<CandidateJudgement | null> {
  const answers = await ask("candidate judgement", {
    state: { statement: clip(content), proposed_type: type },
    questions: {
      mentions_person: noul(
        "Does the statement name, describe, or refer to a specific individual person — a particular student, " +
        "applicant, or staff member — rather than students in general?",
      ),
      is_fact: noul(
        "Does the statement assert a specific fact such as a fee, a price, a date, a deadline, a test score, " +
        "a duration, a percentage, or any other figure?",
        { true: "It states a concrete figure or dated fact", false: "It describes an approach, preference, policy to follow, or common concern" },
      ),
      is_technique: noul(
        "Is the statement reusable guidance about HOW to counsel future students — a technique, a response " +
        "preference, a rule to follow or avoid, terminology to use, or a common concern and how to handle it?",
      ),
      endorsed: noul(
        "Would a professional education counsellor at this institution endorse this statement as guidance " +
        "for colleagues?",
      ),
    },
  });
  if (!answers) return null;
  return {
    mentions_person: answers.mentions_person.noul,
    is_fact: answers.is_fact.noul,
    is_technique: answers.is_technique.noul,
    endorsed: answers.endorsed.noul,
  };
}

// ── Contradictions ───────────────────────────────────────────────────────────

/** Ids of the existing statements the new one contradicts (probability ≥ threshold). */
export async function judgeContradictions(
  candidate: string,
  existing: Array<{ id: string; content: string }>,
  threshold = 0.6,
): Promise<Set<string> | null> {
  if (!existing.length) return new Set();
  const questions: Record<string, ReturnType<typeof noul>> = {};
  existing.forEach((e, i) => {
    questions[`c${i}`] = noul(
      `Does the NEW statement contradict existing statement #${i + 1}? A contradiction means a counsellor ` +
      "could not follow both at once. Being about different topics is not a contradiction.",
    );
  });
  const answers = await ask("contradiction check", {
    state: { new_statement: clip(candidate), existing: existing.map((e, i) => ({ n: i + 1, statement: clip(e.content) })) },
    questions,
  });
  if (!answers) return null;
  const hits = new Set<string>();
  existing.forEach((e, i) => { if (answers[`c${i}`]!.noul >= threshold) hits.add(e.id); });
  return hits;
}

// ── Feedback attribution ─────────────────────────────────────────────────────

/** Ids of the guidance statements the reply actually followed (probability ≥ threshold). */
export async function judgeFollowed(
  reply: string,
  memories: Array<{ id: string; content: string }>,
  threshold = 0.5,
): Promise<Set<string> | null> {
  if (!memories.length) return new Set();
  const questions: Record<string, ReturnType<typeof noul>> = {};
  memories.forEach((m, i) => {
    // "Actively applied", not "not violated": a reply that never mentions nursing has not
    // FOLLOWED "never recommend nursing without IELTS", and a thumbs-down on it says nothing
    // about that rule. Without this wording every avoidance rule collected a vote per complaint.
    questions[`f${i}`] = noul(
      `Does the reply ACTIVELY APPLY guidance #${i + 1} — is its content or structure visibly shaped by that guidance?`,
      { true: "The guidance is clearly reflected in what the reply says or how it is organised", false: "The reply merely does not contradict it, or the guidance is irrelevant to this reply" },
    );
  });
  const answers = await ask("feedback attribution", {
    state: { reply: clip(reply), guidance: memories.map((m, i) => ({ n: i + 1, statement: clip(m.content) })) },
    questions,
  });
  if (!answers) return null;
  const hits = new Set<string>();
  memories.forEach((m, i) => { if (answers[`f${i}`]!.noul >= threshold) hits.add(m.id); });
  return hits;
}
