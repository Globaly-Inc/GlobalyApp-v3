// ponytail: no test file — this workspace has no test runner (backend/tests/*.ts are standalone
// scripts; the frontend has none), and adding one is a dependency decision, not a side effect of
// a UI phase. The function most worth covering is actionsFor(): it mirrors guards in
// backend/src/modules/institution-memory/services/memory.service.ts, so if those move, the UI
// starts offering actions the API refuses. Cover it the day a frontend runner lands.

import { PROMOTION_MIN_ACTORS } from "../const";
import type { Memory, MemoryListParams } from "../apis/types";
import type { MemoryActions, MemoryFilter } from "../types";

/** One capsule → the query the list endpoint understands. */
export function filterToParams(filter: MemoryFilter): MemoryListParams {
  switch (filter) {
    case "all": return {};
    case "flagged": return { flagged: true };
    case "conflicting": return { conflicting: true };
    default: return { status: filter };
  }
}

/**
 * What this memory's buttons may do.
 *
 * Mirrors the service's own guards so the UI never offers an action the API will refuse:
 * `approve()` throws unless the row is a candidate, `reactivate()` unless it is deprecated.
 * Editing a learned candidate is allowed — an institution rewording a rule before approving it
 * is the normal review gesture.
 */
export function actionsFor(memory: Memory): MemoryActions {
  const live = memory.status !== "deleted";
  return {
    canApprove: memory.status === "candidate",
    canDeprecate: live && memory.status !== "deprecated",
    canReactivate: memory.status === "deprecated",
    canUnflag: live && !!memory.flagged_at,
    canEdit: live,
    canDelete: live,
  };
}

/**
 * Why this row is where it is, in one line.
 *
 * Provenance is the whole point of the review screen — "learned from 2 conversations, needs 3"
 * is what tells someone whether to wait or to decide. Counts come from distinct hashed actors,
 * never from how many times the model said it.
 */
export function provenanceLine(memory: Memory): string {
  const actors = memory.source_reference.actors.length;
  const parts: string[] = [];

  if (memory.source === "extracted" || memory.source === "feedback") {
    parts.push(
      actors === 0
        ? "Not yet seen in another conversation"
        : `Seen in ${actors} ${actors === 1 ? "conversation" : "conversations"}`,
    );
    if (memory.status === "candidate" && !memory.conflicts_with_id) {
      const needed = Math.max(0, PROMOTION_MIN_ACTORS - actors);
      parts.push(needed > 0 ? `${needed} more would put it to work automatically` : "ready to go into use");
    }
  }

  if (memory.use_count > 0) {
    parts.push(`used in ${memory.use_count} ${memory.use_count === 1 ? "reply" : "replies"}`);
  }
  const down = memory.source_reference.negative_voters.length;
  if (down > 0) parts.push(`${down} visitor${down === 1 ? "" : "s"} thumbed down a reply that used it`);

  return parts.join(" · ");
}

/** 0.74 → "74%". The model's own number, shown only for things the model proposed. */
export const confidencePct = (confidence: number): string => `${Math.round(confidence * 100)}%`;

/**
 * Only rules the counsellor carries into every single reply. Matches
 * memory.repository.pinned(): every AVOIDANCE_RULE and RESPONSE_PREFERENCE, plus
 * importance-5 guidelines. Everything else has to match the question to be used.
 */
export function isAlwaysOn(memory: Memory): boolean {
  if (memory.status !== "active") return false;
  if (memory.type === "AVOIDANCE_RULE" || memory.type === "RESPONSE_PREFERENCE") return true;
  return memory.type === "COUNSELLING_GUIDELINE" && memory.importance === 5;
}

/** Metadata is free-shaped per type; render whatever is there rather than a fixed field list. */
export function metadataPairs(metadata: Record<string, unknown>): { label: string; value: string }[] {
  return Object.entries(metadata)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([key, value]) => ({
      label: key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()),
      value: Array.isArray(value) ? value.join(", ") : String(value),
    }));
}
