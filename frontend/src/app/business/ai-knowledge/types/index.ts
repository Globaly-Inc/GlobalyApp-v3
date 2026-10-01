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
