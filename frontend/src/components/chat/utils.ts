import type { EnquiryMessage, ChatThread, MessageKind } from "./types";

/** Last activity, falling back to when the business unlocked — a thread with no messages
 * still needs a date, and the unlock is when the conversation became possible. */
export const activityDate = (t: ChatThread) => new Date(t.last_message_at ?? t.unlocked_at);

/** Up to two initials, like V2's getInitials — the avatar fallback everywhere in chat. */
export function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/** `2:58 PM` — V2's per-message stamp (`format(..., "h:mm a")`). */
export const messageTime = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(iso));

/** `23 Aug 2026 · 2:58 PM` — the fuller stamp V2 uses in its Starred/Drafts rows. */
export const fullStamp = (iso: string) =>
  new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));

/**
 * Today / Yesterday / `Tuesday, 18 Aug` — V2's DateSeparator labels. Compared on the
 * local calendar day rather than an hour count, so 11pm→1am reads as two days.
 */
export function dateSeparatorLabel(iso: string): string {
  const date = new Date(iso);
  const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const daysAgo = Math.round((dayStart(new Date()) - dayStart(date)) / 86400000);
  if (daysAgo === 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  return new Intl.DateTimeFormat(undefined, { weekday: "long", day: "2-digit", month: "short" }).format(date);
}

/**
 * Relative age for a conversation row: `2:58 PM` today, `Tue` this week, else `18 Aug`.
 * Mirrors how V2's list reads — recent threads want a time, old ones want a date.
 */
export function listStamp(iso: string): string {
  const date = new Date(iso);
  const ageDays = (Date.now() - date.getTime()) / 86400000;
  if (dateSeparatorLabel(iso) === "Today") return messageTime(iso);
  if (ageDays < 7) return new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date);
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(date);
}

/**
 * What to call this conversation: the name its admin gave it, or the counterpart when nobody has.
 *
 * Every heading, list row, search hit and avatar fallback goes through here. A renamed thread is
 * renamed for everyone on it — the other agents and the student — so having one place that decides
 * the label is what stops half the UI showing the new name and half the old one.
 */
export function threadTitle(thread: Pick<ChatThread, "title" | "counterpart_name">): string {
  return thread.title?.trim() || thread.counterpart_name;
}

/**
 * Which picture to show for this conversation: the one its admin set, or the counterpart's when
 * nobody has. Companion to threadTitle, and routed through the same single place for the same
 * reason — a changed photo changes it for everyone on the thread.
 */
export function threadAvatar(thread: Pick<ChatThread, "thread_photo" | "counterpart_avatar">): string | null {
  return thread.thread_photo ?? thread.counterpart_avatar;
}

/**
 * Everything except a typed message is a thread event, and every event renders as a pill rather
 * than a bubble. Lives here rather than beside the type so types.ts stays type-only — a value
 * export there is unresolvable to bare node, which is what runs self-check.ts.
 */
export const isThreadEvent = (kind: MessageKind): boolean => kind !== "message";

/**
 * Same rule as V2's `shouldGroupMessages`: consecutive messages from one sender inside
 * five minutes render without repeating the avatar and name.
 */
export function isGroupedWith(current: EnquiryMessage, previous: EnquiryMessage | undefined): boolean {
  if (!previous) return false;
  // A thread event breaks the run on both sides. Without this, a message sent just after someone
  // was added would group onto the event — losing its avatar and header — because the event
  // carries the acting admin's sender_id.
  if (isThreadEvent(current.kind) || isThreadEvent(previous.kind)) return false;
  if (current.sender_id !== previous.sender_id) return false;
  const minutes = Math.abs(new Date(current.created_at).getTime() - new Date(previous.created_at).getTime()) / 60000;
  return minutes < 5;
}

/** Strips the markdown the composer inserts, so a preview line reads as plain text. */
export function previewText(body: string): string {
  return body
    .replace(/[*_~`]/g, "")
    .replace(/^\s*[•\d]+[.)]?\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The whole conversation as readable plain text — "Copy complete chat".
 *
 * V2 has no export of its own (only per-message "Copy text" / "Copy link" in
 * MessageActionsToolbar), so this is that action widened to the thread, keeping its
 * format deliberately plain: a header naming the two sides, then `Name · time` above
 * each message. No ids, no roles, no internal metadata — the copy is for pasting into
 * an email or a document, not for re-importing.
 */
export function conversationToText(
  thread: Pick<ChatThread, "title" | "counterpart_name" | "course_name">,
  messages: EnquiryMessage[],
): string {
  const lines = [`Conversation with ${threadTitle(thread)}`, `Course: ${thread.course_name}`, ""];
  let lastDay = "";
  for (const m of messages) {
    const day = dateSeparatorLabel(m.created_at);
    if (day !== lastDay) {
      lines.push(`— ${day} —`);
      lastDay = day;
    }
    lines.push(`${m.sender_name} · ${messageTime(m.created_at)}`, m.body, "");
  }
  return lines.join("\n").trimEnd();
}

/** Clipboard write, reported as a boolean so callers can toast the failure. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// ── Attachments ──
//
// Mirrors GlobalyOS V2's AttachmentRenderer helpers (isImage / isVideo / isPdf /
// formatFileSize), which branch on MIME type with a filename fallback for PDFs.

export const isImageFile = (mimeType: string) => mimeType.startsWith("image/");
export const isVideoFile = (mimeType: string) => mimeType.startsWith("video/");
export const isPdfFile = (mimeType: string, fileName = "") =>
  mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");

/** `1.4 MB`. Bytes below 1 KB round up to `1 KB` rather than reading as `0.4 KB`. */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  // One decimal only once past 10 units, so "1.4 MB" but "512 KB".
  return `${value < 10 ? Math.max(value, 1).toFixed(1).replace(/\.0$/, "") : Math.round(value)} ${units[unit]}`;
}

/** The extension chip shown on a non-previewable file tile — V2 does the same. */
export const fileExtension = (fileName: string) => fileName.split(".").pop()?.toUpperCase() ?? "FILE";
