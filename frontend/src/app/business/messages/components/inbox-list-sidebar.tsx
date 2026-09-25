"use client";

import { useMemo, useState } from "react";
import { Bot, MessageSquare, Search, User } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SIDEBAR_LABEL, SIDEBAR_ROW, SIDEBAR_ROW_ACTIVE } from "@/components/chat/const";
import { ConversationRow } from "@/components/chat/conversation-row";
import { activityDate, listStamp, threadTitle } from "@/components/chat/utils";
import type { ChatThread } from "@/components/chat/types";
import { cn } from "@/lib/utils";
import { VISITOR_STATUS_BADGE } from "@/app/business/ai-widget/const";
import { visitorDisplayName, visitorInitials } from "@/app/business/ai-widget/utils";
import type { WidgetVisitor } from "@/app/business/ai-widget/apis/types";

type Item =
  | { kind: "enquiry"; at: number; thread: ChatThread }
  | { kind: "embed"; at: number; visitor: WidgetVisitor };

/**
 * The rail for the All and AI Conversations tabs: the same column, search field and rows as the
 * enquiry `ChatSidebar`, over one merged list. Enquiry rows are the real `ConversationRow`;
 * AI conversation rows share its layout with a bot badge on the avatar, so the two read as one Inbox.
 *
 * Unread enquiries float to the top (the enquiry list's rule), then everything by newest
 * activity. Search here is a client-side filter on name, programme and last message; the
 * Enquiries tab keeps `ChatSearch`, which also searches message history.
 */
export function InboxListSidebar({
  header,
  threads,
  visitors,
  loading,
  activeThreadId,
  activeVisitorId,
  onOpenThread,
  onOpenVisitor,
  onToggleFavorite,
}: Readonly<{
  header: React.ReactNode;
  /** Empty on the AI Conversations tab. */
  threads: ChatThread[];
  visitors: WidgetVisitor[];
  loading: boolean;
  activeThreadId: string | null;
  activeVisitorId: number | null;
  onOpenThread: (distributionId: string) => void;
  onOpenVisitor: (id: number) => void;
  onToggleFavorite: (distributionId: string) => void;
}>) {
  const [query, setQuery] = useState("");

  const items = useMemo(() => {
    const term = query.trim().toLowerCase();
    const hit = (...parts: (string | null | undefined)[]) => !term || parts.join(" ").toLowerCase().includes(term);
    const all: Item[] = [
      ...threads
        .filter((t) => hit(threadTitle(t), t.course_name, t.last_message_body))
        .map((thread) => ({ kind: "enquiry" as const, at: activityDate(thread).getTime(), thread })),
      ...visitors
        .filter((v) => hit(v.name, v.email, v.study_preference))
        .map((visitor) => ({ kind: "embed" as const, at: new Date(visitor.last_activity_at).getTime(), visitor })),
    ];
    const unread = (i: Item) => Number(i.kind === "enquiry" && i.thread.unread_count > 0);
    return all.sort((a, b) => unread(b) - unread(a) || b.at - a.at);
  }, [threads, visitors, query]);

  const embedOnly = threads.length === 0;

  return (
    <div className="flex h-full flex-col border-border bg-card md:border-r">
      <div className="shrink-0 p-3">
        <div className="relative w-full">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, programme or message"
            aria-label="Search conversations"
            className="h-9 w-full border-border bg-muted/50 pl-9 focus-visible:bg-background"
          />
        </div>
        {header}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <p className={cn(SIDEBAR_LABEL, "mb-2 px-2")}>{embedOnly ? "AI Conversations" : "Conversations"}</p>

        {loading ? (
          <div className="space-y-1 px-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-2.5 py-1.5">
                <Skeleton className="size-8 shrink-0 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-2.5 w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center px-2 py-6 text-center">
            {embedOnly ? (
              <Bot className="mb-2 size-8 text-muted-foreground/40" aria-hidden />
            ) : (
              <MessageSquare className="mb-2 size-8 text-muted-foreground/40" aria-hidden />
            )}
            <p className="text-sm text-muted-foreground">{query ? "No matching conversations" : "No conversations yet"}</p>
            {!query && (
              <p className="mt-1 text-xs text-muted-foreground/80">
                {embedOnly
                  ? "Conversations visitors have with the AI assistant on your website appear here."
                  : "Unlocked enquiries and AI assistant chats from your website appear here."}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-0.5">
            {items.map((item) =>
              item.kind === "enquiry" ? (
                <ConversationRow
                  key={`e-${item.thread.distribution_id}`}
                  thread={item.thread}
                  isActive={item.thread.distribution_id === activeThreadId}
                  onOpen={() => onOpenThread(item.thread.distribution_id)}
                  onToggleFavorite={() => onToggleFavorite(item.thread.distribution_id)}
                />
              ) : (
                <EmbedRow
                  key={`v-${item.visitor.id}`}
                  visitor={item.visitor}
                  isActive={item.visitor.id === activeVisitorId}
                  onOpen={() => onOpenVisitor(item.visitor.id)}
                />
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** `ConversationRow`'s layout, with a bot badge on the avatar marking it as a widget chat. */
function EmbedRow({ visitor, isActive, onOpen }: Readonly<{ visitor: WidgetVisitor; isActive: boolean; onOpen: () => void }>) {
  const badge = VISITOR_STATUS_BADGE[visitor.status];
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(SIDEBAR_ROW, "cursor-pointer items-start", isActive ? SIDEBAR_ROW_ACTIVE : "hover:bg-muted/60")}
    >
      <span className="relative shrink-0">
        <Avatar className="size-8">
          <AvatarFallback className="bg-muted text-xs text-muted-foreground">
            {visitor.name ? visitorInitials(visitor) : <User className="size-4" aria-hidden />}
          </AvatarFallback>
        </Avatar>
        <span
          className="absolute -bottom-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full bg-primary ring-2 ring-card"
          title="AI conversation"
        >
          <Bot className="size-2.5 text-primary-foreground" aria-hidden />
        </span>
      </span>

      <span className="min-w-0 flex-1 text-left">
        <span className="flex items-baseline gap-1.5">
          <span className={cn("truncate", !visitor.name && "italic text-muted-foreground")}>
            {visitorDisplayName(visitor)}
          </span>
          <span className="ml-auto shrink-0 text-[10px] font-normal text-muted-foreground">
            {listStamp(visitor.last_activity_at)}
          </span>
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
          <span className="truncate">
            AI · {visitor.email ?? visitor.study_preference ?? `${visitor.message_count} message${visitor.message_count === 1 ? "" : "s"}`}
          </span>
          {visitor.status === "lead" && (
            <span className={cn("ml-auto shrink-0 rounded px-1.5 text-[10px] font-medium", badge.className)}>
              {badge.label}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}
