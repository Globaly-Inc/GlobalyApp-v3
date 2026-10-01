"use client";

import { useEffect, useMemo, useState } from "react";
import { Bot, Loader2, MessageSquare, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { MIN_SEARCH_LENGTH, SIDEBAR_LABEL } from "@/components/chat/const";
import { ConversationRow } from "@/components/chat/conversation-row";
import { activityDate, threadTitle } from "@/components/chat/utils";
import type { ChatThread, EnquiryMessage } from "@/components/chat/types";
import { cn } from "@/lib/utils";
import type { WidgetVisitor } from "@/app/business/ai-widget/apis/types";
import { embedChatState } from "../utils";
import { EmbedRow } from "./embed-row";

/** The AI Conversations tab's quick filters, over the rows already loaded. */
const EMBED_FILTERS = [
  { value: "all", label: "All" },
  { value: "ai", label: "AI handling" },
  { value: "human", label: "With team" },
  { value: "unread", label: "Unread" },
  { value: "resolved", label: "Resolved" },
] as const;
type EmbedFilter = (typeof EMBED_FILTERS)[number]["value"];

function matchesFilter(v: WidgetVisitor, filter: EmbedFilter): boolean {
  if (filter === "all") return true;
  if (filter === "unread") return (v.unread_count ?? 0) > 0;
  return embedChatState(v) === filter;
}

type Item =
  /** `messageId`: the newest loaded message matching the search, revealed on open. */
  | { kind: "enquiry"; at: number; thread: ChatThread; messageId?: number }
  | { kind: "embed"; at: number; visitor: WidgetVisitor };

/**
 * The rail for the All and AI Conversations tabs: the same column, search field and rows as the
 * enquiry `ChatSidebar`, over one merged list. Enquiry rows are the real `ConversationRow`;
 * AI conversation rows share its layout with a bot badge on the avatar, so the two read as one Inbox.
 *
 * Unread enquiries float to the top (the enquiry list's rule), then everything by newest
 * activity. Search here is a client-side filter on name, programme and last message; the
 * Enquiries tab keeps `ChatSearch`, which also searches message history.
 *
 * Search covers what `ChatSearch` does on the enquiry side — a thread's title, course, latest
 * message, and every message already loaded for it — and opens a message hit AT that message.
 * AI conversations are searched on the server (name, email, programme), since only some pages are loaded.
 */
export function InboxListSidebar({
  header,
  threads,
  visitors,
  messagesByThread,
  loading,
  hasMore,
  loadingMore,
  activeThreadId,
  activeVisitorId,
  onOpenThread,
  onOpenVisitor,
  onToggleFavorite,
  onSearchVisitors,
  onLoadMore,
}: Readonly<{
  header: React.ReactNode;
  /** Empty on the AI Conversations tab. */
  threads: ChatThread[];
  visitors: WidgetVisitor[];
  messagesByThread: Record<string, EnquiryMessage[]>;
  loading: boolean;
  /** More visitor pages exist on the server for the current search. */
  hasMore: boolean;
  loadingMore: boolean;
  activeThreadId: string | null;
  activeVisitorId: number | null;
  onOpenThread: (distributionId: string, messageId?: number) => void;
  onOpenVisitor: (id: number) => void;
  onToggleFavorite: (distributionId: string) => void;
  /** Debounced; the parent refetches page 1 only when the term actually changed. */
  onSearchVisitors: (term: string) => void;
  onLoadMore: () => void;
}>) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<EmbedFilter>("all");
  const embedOnly = threads.length === 0;

  useEffect(() => {
    const t = setTimeout(() => onSearchVisitors(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query, onSearchVisitors]);

  const items = useMemo(() => {
    const term = query.trim().toLowerCase();
    const hit = (...parts: (string | null | undefined)[]) => !term || parts.join(" ").toLowerCase().includes(term);
    // ChatSearch's rule: message bodies only count from two characters up.
    const newestMessageHit = (t: ChatThread) =>
      term.length < MIN_SEARCH_LENGTH
        ? undefined
        : (messagesByThread[t.distribution_id] ?? [])
            .filter((m) => m.body.toLowerCase().includes(term))
            .reduce<EnquiryMessage | undefined>((best, m) => (!best || m.created_at > best.created_at ? m : best), undefined);
    const enquiries: Item[] = [];
    for (const thread of threads) {
      const message = newestMessageHit(thread);
      if (!message && !hit(threadTitle(thread), thread.course_name, thread.last_message_body)) continue;
      enquiries.push({ kind: "enquiry", at: activityDate(thread).getTime(), thread, messageId: message?.id });
    }
    const all: Item[] = [
      ...enquiries,
      ...visitors
        .filter((v) => hit(v.name, v.email, v.study_preference) && (!embedOnly || matchesFilter(v, filter)))
        .map((visitor) => ({ kind: "embed" as const, at: new Date(visitor.last_activity_at).getTime(), visitor })),
    ];
    const unread = (i: Item) => Number(i.kind === "enquiry" ? i.thread.unread_count > 0 : (i.visitor.unread_count ?? 0) > 0);
    return all.sort((a, b) => unread(b) - unread(a) || b.at - a.at);
  }, [threads, visitors, messagesByThread, query, embedOnly, filter]);

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
        {embedOnly && (
          <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="Filter AI conversations">
            {EMBED_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                aria-pressed={filter === f.value}
                onClick={() => setFilter(f.value)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                  filter === f.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
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
            <p className="text-sm text-muted-foreground">
              {query || filter !== "all" ? "No matching conversations" : "No conversations yet"}
            </p>
            {!query && filter === "all" && (
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
                  onOpen={() => onOpenThread(item.thread.distribution_id, item.messageId)}
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

        {!loading && hasMore && (
          <Button variant="ghost" size="sm" className="mt-2 w-full text-muted-foreground" disabled={loadingMore} onClick={onLoadMore}>
            {loadingMore && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
            Load more AI conversations
          </Button>
        )}
      </div>
    </div>
  );
}
