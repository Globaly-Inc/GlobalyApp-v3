import { Bookmark, FileEdit, MessageCircle } from "lucide-react";
import type { ShortcutType } from "../types";

/**
 * The SHORTCUTS block, matching GlobalyOS V2's ChatSidebar order and icons. V2 also
 * lists Mentions between Unread and Starred; a two-party enquiry thread has nobody to
 * mention, so it is dropped rather than shipped empty.
 */
export const SHORTCUTS: ReadonlyArray<{
  type: ShortcutType;
  label: string;
  /** Second line in the view header — V2's SpecialViewHeader subtitles verbatim. */
  subtitle: string;
  icon: typeof MessageCircle;
  /** Header chip colours, from V2's SpecialViewHeader config. */
  iconBg: string;
  iconColor: string;
}> = [
  {
    type: "unread",
    label: "Unread",
    subtitle: "Messages you haven't read yet",
    icon: MessageCircle,
    iconBg: "bg-destructive/10",
    iconColor: "text-destructive",
  },
  {
    type: "starred",
    label: "Starred",
    subtitle: "Your bookmarked messages",
    icon: Bookmark,
    iconBg: "bg-blue-500/10",
    iconColor: "text-blue-500",
  },
  {
    type: "drafts",
    label: "Drafts",
    subtitle: "Your unsent messages",
    icon: FileEdit,
    iconBg: "bg-muted",
    iconColor: "text-muted-foreground",
  },
];

/** How often an open thread refetches. Polling, per PRD §7.6 — v3 has no socket layer. */
export const POLL_MS = 15_000;

/** V2's GlobalChatSearch only queries at two characters or more. */
export const MIN_SEARCH_LENGTH = 2;

/** Must match MAX_ATTACHMENTS_PER_MESSAGE in the backend's message-media.service.ts. */
export const MAX_ATTACHMENTS = 5;

/**
 * Shared row classes for every selectable item in the sidebar (shortcuts, favorites,
 * conversations) — V2 repeats this exact string in all three places.
 */
export const SIDEBAR_ROW = "flex items-center gap-2.5 w-full px-2 py-1.5 rounded-md text-sm transition-colors";
export const SIDEBAR_ROW_ACTIVE = "bg-primary/10 text-primary font-medium border-l-2 border-primary";
export const SIDEBAR_ROW_IDLE = "hover:bg-muted/60 text-foreground/80";
/** V2's section label: `SHORTCUTS`, `FAVORITES`. */
export const SIDEBAR_LABEL = "text-[11px] font-semibold text-muted-foreground uppercase tracking-wider";
