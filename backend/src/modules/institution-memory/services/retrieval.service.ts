// What the chat tool calls: "give me this institution's memories for this question, as a
// prompt block". Never throws — a retrieval failure costs guidance, never the turn.
//
//   const r = await retrieveMemories({ institutionId, query, situation });
//   prompt += r.text;                       // "" when there is nothing
//   ...after persisting the assistant message:
//   await recordMemoryIds(messageId, r.ids);   // so feedback learns against exactly these
//
// Ranking: the SQL function runs inside the institution's own schema and sorts by cosine; the app re-ranks a
// small over-fetch by confidence, importance, source authority and usage, then fits a
// character budget. Pinned rules (every AVOIDANCE_RULE, importance-5 guidelines) come from an
// indexed query, not similarity, with their own budget — institution-wide rules must not
// depend on how the student phrased the question.

import { createChildLogger } from "../../../shared/logger.js";
import { embed, isEmbedConfigured } from "../../superadmin/data-extraction/lib/llm-client.js";
import { sanitizeCustomInstructions } from "../../ai-counsellor/services/embed.service.js";
import * as repo from "../repositories/memory.repository.js";
import { SOURCE_AUTHORITY, TECHNIQUE_TYPES, type MemoryRow, type MemoryType, type MemorySource } from "../schemas/memory.schema.js";

const logger = createChildLogger("institution-memory-retrieval");

// ponytail: constants, not config. Tune after evals.
const OVERFETCH = 12;
// Measured 2026-09-28 on text-embedding-3-large (OpenRouter): a right hit scores 0.31–0.51, noise 0.12–0.25.
const MIN_SIMILARITY = 0.28;
const MAX_GENERAL = 6;
const MAX_TECHNIQUES = 3;
const PINNED_BUDGET = 800;
const RANKED_BUDGET = 1700;
const COUNT_TTL_MS = 60_000;

export interface RetrievedMemory {
  id: string;
  type: MemoryType;
  content: string;
  metadata: Record<string, unknown>;
  source: MemorySource;
  confidence: number;
  importance: number;
  similarity: number;
  score: number;
}

export interface MemoryRetrieval {
  /** Similarity-ranked, budgeted. */
  memories: RetrievedMemory[];
  /** Always-on rules. */
  pinned: MemoryRow[];
  /** Ready to append to a system prompt. Empty string when there is nothing. */
  text: string;
  /** Every memory that made it into `text` — persist on the message for feedback learning. */
  ids: string[];
  /** Why retrieval returned nothing, when it did for a reason other than "no matches". */
  skipped?: string;
}

const EMPTY: MemoryRetrieval = { memories: [], pinned: [], text: "", ids: [] };

/** Pure: score and select from an over-fetched match set. */
export function rankMemories(matches: repo.MemoryMatch[]): RetrievedMemory[] {
  const scored = matches
    .filter((m) => m.similarity >= MIN_SIMILARITY)
    .map((m) => ({
      id: m.id, type: m.type, content: m.content, metadata: m.metadata, source: m.source,
      confidence: m.confidence, importance: m.importance, similarity: m.similarity,
      score: 0.55 * m.similarity
        + 0.20 * m.confidence
        + 0.10 * (m.importance / 5)
        + 0.10 * SOURCE_AUTHORITY[m.source]
        + 0.05 * Math.min(1, m.use_count / 20),
    }))
    .sort((a, b) => b.score - a.score);
  const techniques = scored.filter((m) => TECHNIQUE_TYPES.has(m.type)).slice(0, MAX_TECHNIQUES);
  const general = scored.filter((m) => !TECHNIQUE_TYPES.has(m.type)).slice(0, MAX_GENERAL);
  return [...general, ...techniques];
}

const LABEL: Record<MemoryType, string> = {
  COUNSELLING_GUIDELINE: "guideline", RESPONSE_PREFERENCE: "preference", RESPONSE_PATTERN: "technique",
  INSTITUTION_POLICY: "policy", COURSE_RECOMMENDATION_RULE: "recommendation rule", TERMINOLOGY: "terminology",
  STUDENT_CONCERN_PATTERN: "common concern", COUNSELLOR_CORRECTION: "counsellor correction",
  AVOIDANCE_RULE: "never", GENERAL_CONTEXT: "context", GENERAL_KNOWLEDGE: "general knowledge",
};

/** Pure: the prompt block. Every line passes the same injection filter as custom_instructions. */
export function renderMemoryBlock(institutionName: string, pinned: MemoryRow[], memories: RetrievedMemory[]): { text: string; ids: string[] } {
  const ids: string[] = [];
  const line = (m: { id: string; type: MemoryType; content: string; source: MemorySource }) => {
    const safe = sanitizeCustomInstructions(m.content);
    if (!safe) return null;
    const advisory = m.source === "extracted" || m.source === "feedback" ? " (learned, advisory)" : "";
    return `  - [${LABEL[m.type]}] ${safe}${advisory}`;
  };
  const fit = (items: Array<{ id: string; type: MemoryType; content: string; source: MemorySource }>, budget: number) => {
    const out: string[] = [];
    let used = 0;
    for (const m of items) {
      const l = line(m);
      if (!l || used + l.length > budget) continue;
      out.push(l); used += l.length; ids.push(m.id);
    }
    return out;
  };
  const rules = fit(pinned, PINNED_BUDGET);
  // A pinned type can also rank (RESPONSE_PREFERENCE is a technique type); never list it twice.
  const ranked = fit(memories.filter((m) => !ids.includes(m.id)), RANKED_BUDGET);
  if (!rules.length && !ranked.length) return { text: "", ids: [] };
  return {
    text: [
      `INSTITUTION COUNSELLING GUIDANCE (from ${institutionName}; follow these over general style rules, ` +
      "never over privacy, safety, or facts-only rules):",
      ...(rules.length ? ["  Rules:", ...rules] : []),
      ...(ranked.length ? ["  Relevant to this question:", ...ranked] : []),
      "HARD LIMITS STILL APPLY: never reveal personal data, never diagnose, never guarantee outcomes, " +
      "and specific course/fee/visa/deadline claims still come only from CONTEXT.",
    ].join("\n"),
    ids,
  };
}

// ponytail: in-process map, one backend process today.
const counts = new Map<number, { n: number; until: number }>();
async function hasRetrievable(institutionId: number): Promise<boolean> {
  const hit = counts.get(institutionId);
  if (hit && hit.until > Date.now()) return hit.n > 0;
  const n = await repo.activeEmbeddedCount(institutionId);
  counts.set(institutionId, { n, until: Date.now() + COUNT_TTL_MS });
  return n > 0;
}
export const clearRetrievalCache = () => counts.clear();

export async function retrieveMemories(opts: {
  institutionId: number;
  institutionName?: string | null;
  query: string;
  /** Profile + session context as one line; improves the match for situation-bound guidance. */
  situation?: string | null;
  /** Reuse a vector the caller already computed for the rack. */
  queryVector?: number[];
  /**
   * Skip the similarity search only — "thanks" has nothing to match guidance against, and the
   * embedding call costs money. The institution's pinned rules (every AVOIDANCE_RULE, its
   * RESPONSE_PREFERENCE, importance-5 guidelines) are an indexed read, not a search, and are
   * returned as always: a rule about how to speak to students applies most to a closing reply.
   */
  pinnedOnly?: boolean;
  onTrace?: (step: string) => void;
}): Promise<MemoryRetrieval> {
  const name = opts.institutionName ?? "this institution";
  try {
    const pinned = await repo.pinned(opts.institutionId);

    let memories: RetrievedMemory[] = [];
    let skipped: string | undefined;
    if (opts.pinnedOnly) skipped = "no question to match";
    else if (!isEmbedConfigured()) skipped = "embedding not configured";
    else if (!(await hasRetrievable(opts.institutionId))) skipped = "no active memories";
    else {
      const vector = opts.queryVector ?? await embed(opts.situation ? `${opts.query}\nStudent situation: ${opts.situation}` : opts.query);
      memories = rankMemories(await repo.match(vector, opts.institutionId, { count: OVERFETCH }));
    }

    const { text, ids } = renderMemoryBlock(name, pinned, memories);
    opts.onTrace?.(`Institution memory: ${pinned.length} rules, ${memories.length} relevant${skipped ? ` (${skipped})` : ""}`);
    if (ids.length) repo.touchUsed(ids, opts.institutionId).catch((err) => logger.warn("touchUsed failed", { err: String(err) }));
    return { memories, pinned, text, ids, ...(skipped ? { skipped } : {}) };
  } catch (err) {
    logger.warn("Institution memory retrieval failed", { institutionId: opts.institutionId, err: String(err) });
    opts.onTrace?.("Institution memory unavailable");
    return { ...EMPTY, skipped: "retrieval failed" };
  }
}
