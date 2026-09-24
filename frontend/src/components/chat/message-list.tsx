"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import {
  Camera,
  Crown,
  Info,
  Loader2,
  LogOut,
  MessageSquare,
  Pencil,
  ShieldOff,
  UserRoundMinus,
  UserRoundPlus,
  type LucideIcon,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { dateSeparatorLabel, initials, isGroupedWith, isThreadEvent, messageTime } from "./utils";
import { MessageRow } from "./message-row";
import { ScrollToBottom } from "./scroll-to-bottom";
import type { ChatThread, EnquiryMessage, MessageKind } from "./types";
import { useChatCopy } from "./chat-copy";

/** V2's `DateSeparator`: a centred label between two hairlines. */
function DateSeparator({ label }: Readonly<{ label: string }>) {
  return (
    <div className="my-4 flex items-center gap-3 px-4">
      <div className="h-px flex-1 bg-border" />
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

/**
 * One icon per verb, keyed off the stored `kind` rather than read out of the sentence — that is the
 * whole reason the verb is a column (see the 20260901_002 migration). A kind with no entry falls
 * back to the neutral one rather than rendering nothing.
 *
 * The crown pair is GlobalyOS's: gold going up, grey going down, so a promotion and a demotion are
 * distinguishable at a glance without reading either line.
 */
const EVENT_ICON: Record<MessageKind, { icon: LucideIcon; className?: string }> = {
  message: { icon: Info },
  member_added: { icon: UserRoundPlus, className: "text-emerald-600 dark:text-emerald-500" },
  member_removed: { icon: UserRoundMinus, className: "text-destructive" },
  member_left: { icon: LogOut },
  admin_granted: { icon: Crown, className: "text-amber-500" },
  admin_revoked: { icon: ShieldOff },
  renamed: { icon: Pencil },
  photo_changed: { icon: Camera },
};

/**
 * A thread event — invited, removed, promoted, renamed — drawn the way GlobalyOS draws them: a
 * quiet pill in the timeline, no avatar, no bubble, no hover actions. They are attributed to a real
 * person in the database (enquiry_messages.sender_id is NOT NULL), so rendering them as a message
 * made it look like that person had typed the sentence out.
 *
 * Left-aligned rather than centred, and inline-flex rather than full width, so a run of them reads
 * as a list of small facts instead of a stack of banners.
 */
function ThreadEventRow({ message }: Readonly<{ message: EnquiryMessage }>) {
  const { icon: Icon, className } = EVENT_ICON[message.kind] ?? EVENT_ICON.message;
  return (
    <div id={`message-${message.id}`} className="px-4 py-1">
      <div className="inline-flex max-w-full items-center gap-2 rounded-full bg-muted/60 px-3 py-1">
        <Icon className={cn("size-3.5 shrink-0", className ?? "text-muted-foreground")} aria-hidden />
        <span className="min-w-0 break-words text-xs font-medium text-muted-foreground">{message.body}</span>
        <time dateTime={message.created_at} className="shrink-0 text-[11px] tabular-nums text-muted-foreground/70">
          {messageTime(message.created_at)}
        </time>
      </div>
    </div>
  );
}

/** How far from the bottom still counts as "at the bottom" — V2 uses the same idea. */
const BOTTOM_SLACK_PX = 120;

/**
 * The scrolling message history: date separators, five-minute sender grouping, and
 * stick-to-bottom scrolling with a jump pill when the reader has scrolled away.
 *
 * V2 virtualises this list (TanStack Virtual, `VirtualizedMessageList`) because a team
 * space accumulates tens of thousands of messages. An enquiry thread is one student and
 * one agency talking about one course, so the DOM list is the right size of solution —
 * `/enquiry-messages/:id` returns the whole thread in one shot anyway, so there is no
 * pagination to virtualise against.
 *
 * ponytail: plain DOM list, no virtualisation. If threads ever grow past a few thousand
 * messages, paginate the endpoint first, then virtualise.
 *
 * Keyed by conversation by the caller, so a newly opened thread mounts fresh and starts
 * pinned to its newest message rather than inheriting the last one's scroll position.
 */
export function MessageList({
  messages,
  status,
  counterpartName,
  highlightMessageId,
  canPin,
  canReact,
  canModify,
  distributionId,
  onToggleStar,
  onTogglePin,
  onToggleReaction,
  onOpenThread,
  onEdit,
  onDelete,
  forwardThreads,
  onForward,
}: Readonly<{
  messages: EnquiryMessage[];
  status: "idle" | "loading" | "failed";
  counterpartName: string;
  /** Reveal and briefly tint this message once it is in the list — V2's highlight. */
  highlightMessageId: number | null;
  canPin: boolean;
  canReact: boolean;
  canModify: boolean;
  distributionId: string;
  onToggleStar: (messageId: number) => void;
  onTogglePin: (messageId: number) => void;
  onToggleReaction: (messageId: number, emoji: string) => void;
  onOpenThread: (message: EnquiryMessage) => void;
  onEdit: (messageId: number, body: string) => Promise<boolean>;
  onDelete: (messageId: number) => void;
  /** Drilled straight to MessageRow's Forward dialog. */
  forwardThreads: ChatThread[];
  onForward: (distributionId: string, body: string) => Promise<boolean>;
}>) {
  const copy = useChatCopy();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const highlightedRef = useRef<number | null>(null);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_SLACK_PX);
  };

  // Layout effect, not effect: jumping to the bottom after paint shows a frame of the
  // top of the thread first. Keyed on the count so a poll returning the same messages
  // doesn't yank the view while someone is reading back.
  //
  // A pending highlight wins over stick-to-bottom, and only once per target — the poll
  // must not keep dragging the view back to a message the reader has scrolled away from.
  useLayoutEffect(() => {
    // Clearing the target re-arms the guard, so jumping to the same message twice in a
    // row (clicking one pinned row, scrolling off, clicking it again) still scrolls.
    if (highlightMessageId === null) highlightedRef.current = null;
    if (highlightMessageId !== null && highlightedRef.current !== highlightMessageId) {
      const row = document.getElementById(`message-${highlightMessageId}`);
      if (row) {
        highlightedRef.current = highlightMessageId;
        row.scrollIntoView({ block: "center" });
        row.classList.add("bg-primary/5");
        // Long enough to find the row, short enough not to look like a selection.
        const timer = setTimeout(() => row.classList.remove("bg-primary/5"), 1800);
        return () => clearTimeout(timer);
      }
      // Not rendered yet (the thread is still loading) — wait and retry on the next
      // messages change rather than pinning to the bottom in the meantime.
      return undefined;
    }
    if (atBottom) scrollToBottom();
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, highlightMessageId]);

  if (status === "loading" && messages.length === 0) {
    return (
      <div className="flex-1 space-y-4 p-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-full max-w-md" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (status === "failed" && messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <MessageSquare className="size-10 text-destructive/40" aria-hidden />
        <p className="text-sm font-medium text-destructive">Couldn&apos;t load the conversation.</p>
        <p className="text-xs text-muted-foreground">Check your connection — it will retry on its own shortly.</p>
      </div>
    );
  }

  if (messages.length === 0) {
    // V2's empty conversation: the counterpart's avatar, their name, one line of context.
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
        <Avatar className="mb-4 size-20">
          <AvatarFallback className="bg-primary/10 text-2xl text-primary">{initials(counterpartName)}</AvatarFallback>
        </Avatar>
        <h3 className="text-lg font-semibold">{counterpartName}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {copy.emptyThread}
        </p>
      </div>
    );
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={scrollRef} onScroll={handleScroll} className="h-full overflow-y-auto py-2">
        {messages.map((message, i) => {
          const previous = messages[i - 1];
          const showDate = !previous || dateSeparatorLabel(previous.created_at) !== dateSeparatorLabel(message.created_at);
          return (
            <div key={message.id}>
              {showDate && <DateSeparator label={dateSeparatorLabel(message.created_at)} />}
              {isThreadEvent(message.kind) ? (
                <ThreadEventRow message={message} />
              ) : (
                <MessageRow
                  message={message}
                  // A date separator always starts a fresh group, so the first message
                  // under it keeps its avatar and header.
                  isGrouped={!showDate && isGroupedWith(message, previous)}
                  canPin={canPin}
                  canReact={canReact}
                  canModify={canModify}
                  distributionId={distributionId}
                  onToggleStar={() => onToggleStar(message.id)}
                  onTogglePin={() => onTogglePin(message.id)}
                  onToggleReaction={(emoji) => onToggleReaction(message.id, emoji)}
                  onOpenThread={() => onOpenThread(message)}
                  onEdit={(body) => onEdit(message.id, body)}
                  onDelete={() => onDelete(message.id)}
                  forwardThreads={forwardThreads}
                  onForward={onForward}
                />
              )}
            </div>
          );
        })}
        {status === "loading" && (
          <div className="flex justify-center py-2">
            <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
          </div>
        )}
      </div>

      <ScrollToBottom visible={!atBottom} onClick={scrollToBottom} />
    </div>
  );
}
