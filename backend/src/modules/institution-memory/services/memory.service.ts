// Lifecycle of one institution's memories: create, reinforce, promote, edit, vote, deprecate,
// reactivate, delete, sweep.
//
// Guarantees, in one place:
//   - a human-authored memory is active the moment it is written; a learned one is a candidate
//     until enough DISTINCT students reinforce it or a human approves it;
//   - the same statement is never stored twice for an institution — a repeat is evidence;
//   - a statement a human deprecated stays dead when the model re-learns it;
//   - votes never deprecate a human-authored memory, they flag it;
//   - every state change appends one history entry saying why.

import { createHash } from "node:crypto";
import { createChildLogger } from "../../../shared/logger.js";
import { embed, isEmbedConfigured } from "../../superadmin/data-extraction/lib/llm-client.js";
import { NotFoundError, ConflictError } from "../../../shared/errors.js";
import * as repo from "../repositories/memory.repository.js";
import {
  isHumanSource, METADATA_BY_TYPE,
  type Actor, type CreateMemoryInput, type HistoryEntry, type MemoryRow, type MemorySource,
  type MemoryType, type PatchMemoryInput,
} from "../schemas/memory.schema.js";

const logger = createChildLogger("institution-memory");

/** Distinct students needed before a learned candidate becomes active. */
export const PROMOTION_MIN_ACTORS = 3;
/** Negative votes (distinct actors, none positive) that deprecate a learned memory. */
export const NEGATIVE_VOTE_THRESHOLD = 5;
/** A candidate nobody reinforced for this long is deprecated by the sweep. */
export const CANDIDATE_TTL_DAYS = 90;

// ── Identity ─────────────────────────────────────────────────────────────────

/** Same statement, different whitespace or trailing punctuation → same hash. */
export const normaliseContent = (c: string) => c.trim().replace(/\s+/g, " ").replace(/[.\s]+$/u, "").toLowerCase();
export const hashContent = (c: string) => createHash("sha256").update(normaliseContent(c)).digest("hex");
/** Students enter provenance as a 16-hex hash, never as an id or a fingerprint. */
export const hashActor = (v: string | number) => createHash("sha256").update(String(v)).digest("hex").slice(0, 16);
/** Type semantics ride in the vector, as heading_path does for rack chunks. */
export const embedTextFor = (type: MemoryType, content: string) => `${type.toLowerCase().replace(/_/g, " ")}: ${content}`;

const entry = (event: HistoryEntry["event"], by: Actor, reason?: string): HistoryEntry =>
  ({ at: new Date().toISOString(), event, by, ...(reason ? { reason } : {}) });
const clamp = (n: number) => Math.min(1, Math.max(0, n));

export async function embedOrNull(type: MemoryType, content: string): Promise<number[] | null> {
  if (!isEmbedConfigured()) return null;
  try { return await embed(embedTextFor(type, content)); } catch (err) {
    // A memory without a vector is still listable, editable and pinned-eligible; only similarity
    // retrieval misses it. Better than refusing an admin's rule.
    logger.warn("Memory embedding failed", { type, err: String(err) });
    return null;
  }
}

async function mustFind(id: string, institutionId: number): Promise<MemoryRow> {
  const row = await repo.findById(id, institutionId);
  if (!row) throw new NotFoundError("Memory not found");
  return row;
}

// ── Create ───────────────────────────────────────────────────────────────────

export interface CreateMemoryOpts {
  institutionId: number;
  input: CreateMemoryInput;
  source: MemorySource;
  actor: Actor;
  /** Hashed student whose conversation produced this — counts toward promotion. */
  evidenceActor?: string | null;
  sourceReference?: { message_id?: number; session_id?: number };
  /** Model confidence for learned memories; human sources are always 1. */
  confidence?: number;
  /** A human drafting, not publishing: store as candidate despite the source. */
  asCandidate?: boolean;
  /** A vector the caller already computed (the learning pipeline embeds once for the
   *  contradiction check and the insert). `undefined` = compute here; `null` = none. */
  embedding?: number[] | null;
  createdBy?: number | null;
}

export type CreateOutcome =
  | { outcome: "created"; memory: MemoryRow }
  | { outcome: "reinforced"; memory: MemoryRow; promoted: boolean }
  | { outcome: "promoted"; memory: MemoryRow }
  | { outcome: "reactivated"; memory: MemoryRow }
  | { outcome: "rejected"; reason: "previously_deprecated"; memory: MemoryRow };

/**
 * Store a statement, or treat it as evidence for the one already stored.
 *
 *   existing      human input            learned input
 *   candidate     promote                reinforce (may promote)
 *   active        reinforce              reinforce
 *   deprecated    reactivate, version+1  rejected — a human retired it
 */
export async function createMemory(opts: CreateMemoryOpts): Promise<CreateOutcome> {
  const { institutionId, input, source, actor } = opts;
  const human = isHumanSource(source);
  const status = opts.asCandidate || !human ? "candidate" : "active";
  // A human's own words are certain. A rule the extractor DERIVED from them (asCandidate) is
  // not — it carries the judged confidence like any other learned candidate.
  const confidence = human && !opts.asCandidate ? 1 : clamp(opts.confidence ?? 0.6);
  const contentHash = hashContent(input.content);

  const id = await repo.insert({
    institution_id: institutionId,
    type: input.type,
    content: input.content,
    content_hash: contentHash,
    metadata: input.metadata,
    source,
    source_reference: {
      ...opts.sourceReference,
      actors: opts.evidenceActor ? [opts.evidenceActor] : [],
      positive_voters: [], negative_voters: [],
    },
    confidence,
    importance: input.importance,
    status,
    embedding: opts.embedding !== undefined ? opts.embedding : await embedOrNull(input.type, input.content),
    history: [entry("created", actor, `source=${source}`)],
    created_by: opts.createdBy ?? null,
    expires_at: input.expires_at ?? null,
  });
  if (id) return { outcome: "created", memory: await mustFind(id, institutionId) };

  const existing = await repo.findByHash(institutionId, contentHash);
  if (!existing) throw new ConflictError("Memory changed while being created; retry");

  switch (existing.status) {
    case "candidate":
      if (!human) return reinforceMemory(existing, actor, opts.evidenceActor ?? null);
      return { outcome: "promoted", memory: (await repo.transition(existing.id, institutionId, { status: "active", confidence: 1 }, entry("promoted", actor, "human confirmation"))) ?? existing };
    case "active":
      return reinforceMemory(existing, actor, opts.evidenceActor ?? null);
    case "deprecated":
      if (!human) {
        logger.info("Learned memory rejected: previously deprecated", { institutionId, memoryId: existing.id });
        return { outcome: "rejected", reason: "previously_deprecated", memory: existing };
      }
      return { outcome: "reactivated", memory: (await repo.transition(existing.id, institutionId, { status: "active", confidence: 1, flagged_at: null, bumpVersion: true }, entry("reactivated", actor, "re-stated by a human"))) ?? existing };
    default:
      // deleted is excluded by findByHash; unreachable, but a rejected outcome beats a throw.
      return { outcome: "rejected", reason: "previously_deprecated", memory: existing };
  }
}

export async function reinforceMemory(memory: MemoryRow, actor: Actor, evidenceActor: string | null): Promise<Extract<CreateOutcome, { outcome: "reinforced" }>> {
  const updated = (await repo.reinforce(memory.id, memory.institution_id, evidenceActor, entry("reinforced", actor))) ?? memory;
  if (updated.status !== "candidate") return { outcome: "reinforced", memory: updated, promoted: false };
  const promoted = await repo.promoteIfReady(memory.id, memory.institution_id, PROMOTION_MIN_ACTORS, entry("promoted", actor, `${PROMOTION_MIN_ACTORS} distinct students`));
  return { outcome: "reinforced", memory: promoted ?? updated, promoted: !!promoted };
}

/**
 * A learned candidate that contradicts an existing memory. Stored and linked so the portal can
 * show the pair; never promoted by reinforcement (promoteIfReady requires conflicts_with_id IS
 * NULL). A human resolves it with approve() — which clears the link — or remove().
 */
export async function flagConflict(opts: {
  institutionId: number;
  input: CreateMemoryInput;
  conflictsWithId: string;
  confidence: number;
  actor: Actor;
  evidenceActor?: string | null;
  sourceReference?: { message_id?: number; session_id?: number };
  embedding?: number[] | null;
}): Promise<MemoryRow | null> {
  const { institutionId, input, conflictsWithId, actor } = opts;
  const existing = await mustFind(conflictsWithId, institutionId);
  const id = await repo.insert({
    institution_id: institutionId,
    type: input.type,
    content: input.content,
    content_hash: hashContent(input.content),
    metadata: input.metadata,
    source: "extracted",
    source_reference: { ...opts.sourceReference, actors: opts.evidenceActor ? [opts.evidenceActor] : [], positive_voters: [], negative_voters: [] },
    confidence: clamp(opts.confidence),
    importance: input.importance,
    status: "candidate",
    conflicts_with_id: conflictsWithId,
    embedding: opts.embedding !== undefined ? opts.embedding : await embedOrNull(input.type, input.content),
    history: [
      entry("created", actor, "source=extracted"),
      entry("conflict_flagged", actor, `contradicts ${existing.id} (${existing.source})`),
    ],
    expires_at: input.expires_at ?? null,
  });
  if (!id) return null; // already stored — a contradiction flagged twice is still one
  logger.info("Candidate stored as conflicting", { institutionId, memoryId: id, conflictsWith: existing.id });
  return (await repo.findById(id, institutionId)) ?? null;
}

// ── Human actions ────────────────────────────────────────────────────────────

/** Approve a candidate. Clears a conflict link: the human has decided this one stands. */
export async function approve(id: string, institutionId: number, actor: Actor): Promise<MemoryRow> {
  const m = await mustFind(id, institutionId);
  if (m.status !== "candidate") throw new ConflictError(`Memory is ${m.status}, not a candidate`);
  return (await repo.transition(id, institutionId, { status: "active", confidence: 1, conflicts_with_id: null }, entry("promoted", actor, m.conflicts_with_id ? `approved over ${m.conflicts_with_id}` : "approved"))) ?? m;
}

export async function deprecate(id: string, institutionId: number, actor: Actor, reason: string): Promise<MemoryRow> {
  const m = await mustFind(id, institutionId);
  return (await repo.transition(id, institutionId, { status: "deprecated" }, entry("deprecated", actor, reason))) ?? m;
}

export async function reactivate(id: string, institutionId: number, actor: Actor): Promise<MemoryRow> {
  const m = await mustFind(id, institutionId);
  if (m.status !== "deprecated") throw new ConflictError(`Memory is ${m.status}; only deprecated memories can be reactivated`);
  return (await repo.transition(id, institutionId, { status: "active", flagged_at: null, expires_at: null }, entry("reactivated", actor))) ?? m;
}

/** Clears a vote flag without changing status — "I looked, it stays". */
export async function unflag(id: string, institutionId: number, actor: Actor): Promise<MemoryRow> {
  const m = await mustFind(id, institutionId);
  return (await repo.transition(id, institutionId, { flagged_at: null }, entry("edited", actor, "flag cleared"))) ?? m;
}

/** Soft delete: the row stays for its history but frees its dedupe slot. */
export async function remove(id: string, institutionId: number, actor: Actor): Promise<void> {
  await mustFind(id, institutionId);
  await repo.transition(id, institutionId, { status: "deleted" }, entry("deleted", actor));
}

/** Admin edit. Metadata re-validated against the row's type; content changes re-embed. */
export async function edit(id: string, institutionId: number, input: PatchMemoryInput, actor: Actor): Promise<MemoryRow> {
  const m = await mustFind(id, institutionId);
  const metadata = input.metadata ? METADATA_BY_TYPE[m.type].parse(input.metadata) : undefined;
  const contentChanged = input.content !== undefined && hashContent(input.content) !== m.content_hash;
  return (await repo.edit(id, institutionId, {
    ...(input.content !== undefined ? { content: input.content, content_hash: hashContent(input.content) } : {}),
    ...(input.importance !== undefined ? { importance: input.importance } : {}),
    ...(input.expires_at !== undefined ? { expires_at: input.expires_at ? new Date(input.expires_at) : null } : {}),
    ...(metadata ? { metadata } : {}),
    ...(contentChanged && input.content ? { embedding: await embedOrNull(m.type, input.content) } : {}),
  }, entry("edited", actor))) ?? m;
}

// ── Votes ────────────────────────────────────────────────────────────────────

export type VoteOutcome = "counted" | "duplicate" | "deprecated" | "flagged";

/**
 * A student's thumbs on a reply, applied to each memory that shaped it. Learned memories can
 * be voted out; human-authored ones can only be flagged — guest feedback rides on a
 * client-supplied fingerprint, so an anonymous visitor must never remove an admin's rule.
 */
export async function voteOnMemory(id: string, institutionId: number, direction: "positive" | "negative", actorHash: string): Promise<VoteOutcome> {
  const row = await repo.vote(id, institutionId, actorHash, direction);
  if (!row) return "duplicate";
  if (direction === "positive" || row.status !== "active") return "counted";
  const negatives = row.source_reference.negative_voters.length;
  if (negatives < NEGATIVE_VOTE_THRESHOLD || row.source_reference.positive_voters.length > 0) return "counted";

  const by: Actor = { kind: "student", id: actorHash };
  if (isHumanSource(row.source)) {
    if (!row.flagged_at) await repo.transition(id, institutionId, { flagged_at: new Date() }, entry("flagged", by, `${negatives} negative votes`));
    return "flagged";
  }
  await repo.transition(id, institutionId, { status: "deprecated" }, entry("deprecated", by, `${negatives} negative votes`));
  return "deprecated";
}

// ── Sweep ────────────────────────────────────────────────────────────────────

/** Walks every provisioned institution's schema. One tenant's failure never ends the sweep. */
export async function runSweep(): Promise<{ institutions: number; expired: number; stale: number }> {
  const by: Actor = { kind: "system" };
  let expired = 0, stale = 0;
  const ids = await repo.provisionedInstitutionIds();
  for (const institutionId of ids) {
    try {
      expired += await repo.expireDue(institutionId, entry("deprecated", by, "expires_at passed"));
      stale += await repo.deprecateStaleCandidates(institutionId, CANDIDATE_TTL_DAYS, entry("deprecated", by, `candidate unreinforced for ${CANDIDATE_TTL_DAYS} days`));
    } catch (err) {
      // An un-migrated tenant schema is the usual cause; the others still get swept.
      logger.warn("Memory sweep failed for institution", { institutionId, err: err instanceof Error ? err.message : String(err) });
    }
  }
  if (expired || stale) logger.info("Memory sweep", { institutions: ids.length, expired, stale });
  return { institutions: ids.length, expired, stale };
}
