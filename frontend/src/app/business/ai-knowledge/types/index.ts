import type { MemoryStatus } from "../apis/types";

/**
 * The list's one filter control. Four of these map to `status`, two to the boolean flags —
 * flattened into a single capsule row because they are alternatives to the reader, not
 * independent axes, and stacking two filter rows for six options reads as configuration.
 */
export type MemoryFilter = Extract<MemoryStatus, "candidate" | "active" | "deprecated"> | "all" | "flagged" | "conflicting";

export type KnowledgeTab = "style" | "memories" | "conversations" | "insights";

/** What the row's action buttons may do, decided from status/source in one place. */
export interface MemoryActions {
  canApprove: boolean;
  canDeprecate: boolean;
  canReactivate: boolean;
  canUnflag: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

/**
 * The header's figures, from one unfiltered read of the memory list.
 *
 * `saturated` is the honest half of this: the list endpoint caps at 200 rows, so an institution
 * past that would otherwise be told it has exactly 200 rules. When it is true the header says
 * "200+" — a number that stops being exact should look like it, rather than quietly lying.
 */
export interface MemorySummary {
  active: number;
  candidate: number;
  conflicting: number;
  flagged: number;
  alwaysOn: number;
  /** Rows wanting a decision, counted per row by `needsDecision` — never candidate + flagged +
   *  conflicting, which counts a candidate that also contradicts something twice. */
  needsYou: number;
  saturated: boolean;
}
