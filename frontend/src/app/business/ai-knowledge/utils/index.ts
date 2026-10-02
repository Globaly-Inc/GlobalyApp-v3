// ponytail: no test file — this workspace has no test runner (backend/tests/*.ts are standalone
// scripts; the frontend has none), and adding one is a dependency decision, not a side effect of
// a UI phase. The function most worth covering is actionsFor(): it mirrors guards in
// backend/src/modules/institution-memory/services/memory.service.ts, so if those move, the UI
// starts offering actions the API refuses. Cover it the day a frontend runner lands.

import { PROMOTION_MIN_ACTORS, SOURCE_LABEL, SUMMARY_LIMIT } from "../const";
import type { Memory, MemoryListParams } from "../apis/types";
import type { KnowledgeTab, MemoryActions, MemoryFilter, MemorySummary } from "../types";

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

/**
 * Does this row want a decision from a human?
 *
 * Shared by the card (which shows its actions unconditionally when true) and by `summarise`
 * (which counts it). Deliberately ONE function: when the card and the header each decided this
 * for themselves, a flagged ACTIVE rule made the header say "3 rules are flagged" while the
 * figure beside it read 0 — the header shouting about work the counter did not believe existed.
 *
 * Counted per row, never as a sum of separate counters, so a candidate that also contradicts
 * something is one piece of work rather than two.
 */
export function needsDecision(memory: Memory): boolean {
  return memory.status === "candidate" || !!memory.conflicts_with_id || !!memory.flagged_at;
}

/**
 * Counts for the header, in one pass.
 *
 * Conflicting and flagged are counted across every status rather than within candidates, because
 * the header's job is "is anything wrong", and a flagged ACTIVE rule — one visitors have pushed
 * back on while it is in use — is the most urgent thing on this page, not the least.
 */
export function summarise(memories: Memory[]): MemorySummary {
  const summary: MemorySummary = {
    active: 0, candidate: 0, conflicting: 0, flagged: 0, alwaysOn: 0, needsYou: 0,
    saturated: memories.length >= SUMMARY_LIMIT,
  };
  for (const m of memories) {
    if (m.status === "active") summary.active++;
    if (m.status === "candidate") summary.candidate++;
    if (m.conflicts_with_id) summary.conflicting++;
    if (m.flagged_at) summary.flagged++;
    if (isAlwaysOn(m)) summary.alwaysOn++;
    if (needsDecision(m)) summary.needsYou++;
  }
  return summary;
}

/** A count that may have hit the read ceiling. 200 rows back means "200+", never "200". */
export const countLabel = (n: number, saturated: boolean): string => (saturated ? `${n}+` : String(n));

/**
 * What the header says, and the one thing it offers to do about it.
 *
 * Ordered by what would cost the institution most if it sat unseen, NOT by count: a rule that
 * contradicts one the counsellor already follows outranks forty unreviewed suggestions, because
 * the contradiction is already affecting answers while the suggestions are only waiting. A
 * flagged ACTIVE rule outranks everything for the same reason — visitors are pushing back on
 * something that is in use right now.
 *
 * Exactly one call to action, ever. A header offering three things to do is a header nobody acts
 * on, so the most urgent state wins and the rest stay reachable through the tabs.
 */
/**
 * Where this rule came from, naming the person when we know them.
 *
 * "Added by your team" is what the label says when `created_by_name` is null, and null is the
 * honest answer for everything the system wrote — a learned candidate and a worker-derived
 * correction have no author. Only the admin-authored rows carry a name, which is exactly the
 * case someone is asking about when they want to know who wrote a rule.
 */
export function sourceLine(memory: Pick<Memory, "source" | "created_by_name">): string {
  return memory.created_by_name ? `Added by ${memory.created_by_name}` : SOURCE_LABEL[memory.source];
}

export function headlineFor(
  summary: MemorySummary | null,
  unreviewedReplies: number,
): { line: string; cta?: { label: string; tab: KnowledgeTab } } {
  if (!summary) return { line: "Reading what your counsellor knows…" };

  if (summary.flagged > 0) {
    return {
      line: `${plural(summary.flagged, "rule is", "rules are")} flagged — visitors pushed back on replies that used ${summary.flagged === 1 ? "it" : "them"}.`,
      cta: { label: "See what was flagged", tab: "memories" },
    };
  }
  if (summary.conflicting > 0) {
    return {
      line: `${plural(summary.conflicting, "suggestion contradicts", "suggestions contradict")} something your counsellor already follows. Neither goes into use until you pick one.`,
      cta: { label: "Settle it", tab: "memories" },
    };
  }
  if (summary.candidate > 0) {
    return {
      line: `${plural(summary.candidate, "suggestion is", "suggestions are")} waiting on you. Nothing learned is used in a reply until you approve it.`,
      cta: { label: "Review suggestions", tab: "memories" },
    };
  }
  if (unreviewedReplies > 0) {
    return {
      line: `${plural(unreviewedReplies, "reply has", "replies have")} not been looked at yet. Correcting one teaches your counsellor in your own words.`,
      cta: { label: "Review replies", tab: "conversations" },
    };
  }
  if (summary.active === 0) {
    return {
      line: "Answering from your courses and website. Give it the things you'd tell a new counsellor on their first day.",
      cta: { label: "Add your first rule", tab: "memories" },
    };
  }
  return {
    line: `Following ${summary.active} ${summary.active === 1 ? "rule" : "rules"}, and nothing needs you right now.`,
  };
}

/** "1 rule is" / "4 rules are" — the count and the verb agree or the sentence reads broken. */
const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
