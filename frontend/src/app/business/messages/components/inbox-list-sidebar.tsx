"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownUp, Bot, Loader2, MessageSquare, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { MIN_SEARCH_LENGTH, SIDEBAR_LABEL } from "@/components/chat/const";
import { ConversationRow } from "@/components/chat/conversation-row";
import { activityDate, threadTitle } from "@/components/chat/utils";
import type { ChatThread, EnquiryMessage } from "@/components/chat/types";
import { cn } from "@/lib/utils";
import type { WidgetVisitor } from "@/app/business/ai-widget/apis/types";
import { INBOX_CHANNELS, INBOX_VIEWS, type InboxView } from "../const";
import { inChannel, matchesView, needsAttention } from "../utils";
import { ChannelGlyph } from "./channel-glyph";
import { EmbedRow } from "./embed-row";
import type { ChannelFilter } from "./channel-picker";

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
  view,
  onView,
  channel,
  onChannel,
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
  /** The view and channel picked in the Inbox sidebar (`InboxNav`). */
  view: InboxView;
  /** Phones have no sidebar: the views show as a chip row here instead. */
  onView: (view: InboxView) => void;
  channel: ChannelFilter;
  onChannel: (channel: ChannelFilter) => void;
}>) {
  const [query, setQuery] = useState("");
  const embedOnly = threads.length === 0;
  const current = INBOX_VIEWS.find((v) => v.value === view) ?? INBOX_VIEWS[INBOX_VIEWS.length - 2]!;

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
        .filter((v) => hit(v.name, v.email, v.study_preference, v.channel_handle) && (!embedOnly || (matchesView(v, view) && inChannel(v, channel))))
        .map((visitor) => ({ kind: "embed" as const, at: new Date(visitor.last_activity_at).getTime(), visitor })),
    ];
    const unread = (i: Item) => Number(i.kind === "enquiry" ? i.thread.unread_count > 0 : (i.visitor.unread_count ?? 0) > 0);
    // Needs Attention outranks everything: a customer was promised someone, or AI flagged them.
    const waiting = (i: Item) => Number(i.kind === "embed" && needsAttention(i.visitor));
    return all.sort((a, b) => waiting(b) - waiting(a) || unread(b) - unread(a) || b.at - a.at);
  }, [threads, visitors, messagesByThread, query, embedOnly, view, channel]);

  return (
    <div className="flex h-full flex-col border-border bg-card md:border-r">
      <div className="shrink-0 p-3">
        {embedOnly && (
          <div className="mb-3 px-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold">{current.label}</h2>
              {channel !== "all" && (
                <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 py-0.5 pl-1 pr-1 text-xs font-medium text-primary">
                  <ChannelGlyph channel={channel} size="xs" />
                  {INBOX_CHANNELS[channel].label}
                  <button type="button" onClick={() => onChannel("all")} aria-label="Show all channels" className="rounded-full p-0.5 hover:bg-primary/10">
                    <X className="size-3" aria-hidden />
                  </button>
                </span>
              )}
              <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                <ArrowDownUp className="size-3" aria-hidden />
                Needs you first
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {current.hint} · {items.length} conversation{items.length === 1 ? "" : "s"}
            </p>
          </div>
        )}
        <div className="relative w-full">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people, messages, handle"
            aria-label="Search conversations"
            className="h-9 w-full pl-9"
          />
        </div>
        {header}
        {embedOnly && (
          <div className="mt-2 flex gap-1 overflow-x-auto md:hidden" role="group" aria-label="Views">
            {INBOX_VIEWS.map((v) => (
              <button
                key={v.value}
                type="button"
                aria-pressed={view === v.value}
                onClick={() => onView(v.value)}
                className={cn(
                  "shrink-0 rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                  view === v.value
                    ? "border-transparent bg-primary/10 font-medium text-primary"
                    : "border-border text-muted-foreground hover:bg-muted",                )}
              >
                {v.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {!embedOnly && <p className={cn(SIDEBAR_LABEL, "mb-2 px-2")}>Conversations</p>}

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
          <EmptyState
            icon={embedOnly ? Bot : MessageSquare}
            title={query ? "No matching conversations" : view !== "all" || channel !== "all" ? "Nothing here right now" : "No conversations yet"}
            description={
              !query && view === "all" && channel === "all"
                ? embedOnly
                  ? "Conversations visitors have with the AI assistant on your website appear here."
                  : "Unlocked enquiries and AI assistant chats from your website appear here."
                : undefined
            }
            compact
            className="px-2"
          />
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
