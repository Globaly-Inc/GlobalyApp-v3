/**
 * What the chat screen is currently showing. Mirrors GlobalyOS V2's `ActiveChat`
 * discriminated union, minus the parts the student side does not have: no spaces, no
 * groups, no mentions (a two-party thread has nobody to mention).
 */
export type ActiveView =
  | { type: "conversation"; id: string }
  | { type: "unread" }
  | { type: "starred" }
  | { type: "drafts" }
  /** Nothing selected — the welcome panel. */
  | { type: "none" };

/** The sidebar's shortcut rows. `type` doubles as the ActiveView it selects. */
export type ShortcutType = "unread" | "starred" | "drafts";
