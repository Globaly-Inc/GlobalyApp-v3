"use client";

import { useEffect, useRef, useState } from "react";
import { Flag, Loader2, MessagesSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AdminSegmentedTabs } from "@/app/admin/components/admin-segmented-tabs";
import { relativeTime } from "@/components/feed/utils";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchConversations, fetchThread } from "../store/ai-knowledge-reviews-slice";
import type { ReviewSession } from "../apis/types";
import { ReviewThreadSheet } from "./review-thread-sheet";

const QUEUE_TABS = [
  { value: "unreviewed", label: "Needs a look" },
  { value: "all", label: "All" },
] as const;
type QueueTab = (typeof QUEUE_TABS)[number]["value"];

export function ConversationsTab() {
  const dispatch = useAppDispatch();
  const { sessions, status, error } = useAppSelector((s) => s.aiKnowledgeReviews);
  const [queue, setQueue] = useState<QueueTab>("unreviewed");
  const [selected, setSelected] = useState<ReviewSession | null>(null);

  // Strict Mode double-invokes effects, so a bare dispatch here sent two requests on every
  // mount. Keyed on the queue rather than a plain "fetched once" flag: the second invoke sees
  // the same value and skips, while switching tabs still refetches.
  const fetchedQueue = useRef<QueueTab | null>(null);
  useEffect(() => {
    if (fetchedQueue.current === queue) return;
    fetchedQueue.current = queue;
    dispatch(fetchConversations({ unreviewed: queue === "unreviewed" }));
  }, [dispatch, queue]);

  /** Re-read the queue after a review session, so a thread that is now fully reviewed leaves
   *  the "Needs a look" list instead of sitting there with an empty badge. */
  const closeThread = () => {
    setSelected(null);
    fetchedQueue.current = null;
    dispatch(fetchConversations({ unreviewed: queue === "unreviewed" }));
  };

  const open = (session: ReviewSession) => {
    setSelected(session);
    // Always re-read: a thread reviewed in an earlier sheet is stale the moment it is reopened.
    dispatch(fetchThread(session.id));
  };

  return (
    <div>
      <AdminSegmentedTabs options={QUEUE_TABS} value={queue} onChange={setQueue} />

      {status === "loading" && (
        <div className="flex justify-center py-8">
          <Loader2 className="size-5 animate-spin text-primary" />
        </div>
      )}

      {status === "failed" && (
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          {error ?? "Couldn't load conversations."}
        </div>
      )}

      {status === "idle" && sessions.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-12 text-center">
          <MessagesSquare className="size-10 text-muted-foreground/40" />
          <p className="text-sm font-medium">
            {queue === "unreviewed" ? "Nothing waiting on you" : "No conversations yet"}
          </p>
          <p className="max-w-sm text-xs text-muted-foreground">
            {queue === "unreviewed"
              ? "Every reply your widget has given has been looked at."
              : "Conversations appear here as soon as someone talks to your widget."}
          </p>
        </div>
      )}

      {status === "idle" && sessions.length > 0 && (
        <div className="flex flex-col gap-2">
          {sessions.map((session) => (
            <button
              key={session.id}
              type="button"
              onClick={() => open(session)}
              className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-3.5 text-left transition-colors hover:bg-muted/50"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{session.title ?? `Conversation ${session.id}`}</p>
                <p className="text-xs text-muted-foreground">
                  {session.message_count} messages · {relativeTime(session.updated_at)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {session.flagged > 0 && (
                  <Badge variant="outline" className="gap-1 border-destructive/20 bg-destructive/10 text-[11px] text-destructive">
                    <Flag className="size-3" /> {session.flagged}
                  </Badge>
                )}
                {session.unreviewed > 0 && (
                  <Badge variant="secondary" className="text-[11px] tabular-nums">{session.unreviewed} to review</Badge>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      <ReviewThreadSheet
        session={selected}
        open={!!selected}
        onOpenChange={(next) => !next && closeThread()}
      />
    </div>
  );
}
