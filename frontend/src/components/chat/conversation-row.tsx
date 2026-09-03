"use client";

import { Star } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { SIDEBAR_ROW, SIDEBAR_ROW_ACTIVE } from "./const";
import { activityDate, initials, listStamp, previewText, threadTitle, threadAvatar } from "./utils";
import type { ChatThread } from "./types";

/**
 * One conversation in the sidebar — GlobalyOS V2's `ChatSidebar` DM row: avatar, name,
 * muted/unread treatment, count badge, and a hover-revealed action.
 *
 * V2's row is one line (name only); this one carries a second line with the latest
 * message preview and a timestamp, because a student's list is short and the course is
 * the only thing that distinguishes two threads with the same agency. V2's hover
 * `MoreVertical` menu is replaced by a single star toggle: delete/leave/mute have no
 * student-side equivalent, so a whole menu for one item would be ceremony.
 *
 * `compact` drops the preview line — the Favorites section's tighter rows.
 */
export function ConversationRow({
  thread,
  isActive,
  compact = false,
  onOpen,
  onToggleFavorite,
}: Readonly<{
  thread: ChatThread;
  isActive: boolean;
  compact?: boolean;
  onOpen: () => void;
  onToggleFavorite: () => void;
}>) {
  const avatar = threadAvatar(thread);
  const hasUnread = thread.unread_count > 0;

  return (
    <div className="group relative flex items-center">
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          SIDEBAR_ROW,
          "cursor-pointer pr-8",
          compact ? "items-center" : "items-start",
          isActive ? SIDEBAR_ROW_ACTIVE : "hover:bg-muted/60",
          hasUnread && !isActive && "font-semibold text-foreground",
        )}
      >
        <Avatar className={cn("shrink-0", compact ? "size-6" : "size-8")}>
          {avatar && <AvatarImage src={avatar} alt={threadTitle(thread)} />}
          <AvatarFallback className={cn("bg-muted text-muted-foreground", compact ? "text-[10px]" : "text-xs")}>
            {initials(threadTitle(thread))}
          </AvatarFallback>
        </Avatar>

        <span className="min-w-0 flex-1 text-left">
          <span className="flex items-baseline gap-1.5">
            <span className="truncate">{threadTitle(thread)}</span>
            {!compact && (
              <span className="ml-auto shrink-0 text-[10px] font-normal text-muted-foreground">
                {listStamp(activityDate(thread).toISOString())}
              </span>
            )}
          </span>
          {!compact && (
            <span
              className={cn(
                "mt-0.5 block truncate text-xs font-normal",
                hasUnread && !isActive ? "text-foreground/80" : "text-muted-foreground",
              )}
            >
              {thread.last_message_body
                ? `${thread.last_message_is_mine ? "You: " : ""}${previewText(thread.last_message_body)}`
                : thread.course_name}
            </span>
          )}
        </span>

        {hasUnread && (
          <Badge variant="destructive" className="h-5 min-w-5 shrink-0 px-1.5 text-[10px]">
            {thread.unread_count > 99 ? "99+" : thread.unread_count}
          </Badge>
        )}
      </button>

      {/* Sits outside the button so clicking the star never opens the thread. Always
          visible once favorited, revealed on hover otherwise — V2's Favorites row does
          exactly this. */}
      <button
        type="button"
        onClick={onToggleFavorite}
        aria-label={thread.is_favorite ? "Remove from favorites" : "Add to favorites"}
        title={thread.is_favorite ? "Remove from favorites" : "Add to favorites"}
        className={cn(
          "absolute right-1 cursor-pointer rounded p-1 transition-opacity hover:bg-muted",
          thread.is_favorite ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
        )}
      >
        <Star
          className={cn("size-3.5", thread.is_favorite ? "fill-orange-500 text-orange-500" : "text-muted-foreground")}
        />
      </button>
    </div>
  );
}
