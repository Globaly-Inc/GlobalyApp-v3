"use client";

import { MessageSquare } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { SIDEBAR_LABEL } from "./const";
import { ConversationRow } from "./conversation-row";
import type { ChatThread } from "./types";
import type { ActiveView } from "./ui-types";
import { useChatCopy } from "./chat-copy";

/**
 * The conversation list — GlobalyOS V2's `ChatSidebar` "Direct Messages" tab, minus the
 * tab bar: the student side has no Spaces to switch to, so a single labelled list is
 * the whole thing.
 *
 * Sorted with V2's rule (`sortedConversations`): threads with unread messages first,
 * then by newest activity. V2 also sinks muted conversations to the bottom; there is no
 * mute on the student side.
 */
export function ConversationList({
  threads,
  loading,
  active,
  onOpen,
  onToggleFavorite,
}: Readonly<{
  threads: ChatThread[];
  loading: boolean;
  active: ActiveView;
  onOpen: (distributionId: string) => void;
  onToggleFavorite: (distributionId: string) => void;
}>) {
  const copy = useChatCopy();
  return (
    <div className="px-3 py-3">
      <p className={cn(SIDEBAR_LABEL, "mb-2 px-2")}>Conversations</p>

      {loading ? (
        <div className="space-y-1 px-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-2.5 py-1.5">
              <Skeleton className="size-8 shrink-0 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-2.5 w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : threads.length === 0 ? (
        <div className="flex flex-col items-center px-2 py-6 text-center">
          <MessageSquare className="mb-2 size-8 text-muted-foreground/40" aria-hidden />
          <p className="text-sm text-muted-foreground">No conversations yet</p>
          <p className="mt-1 text-xs text-muted-foreground/80">
            {copy.emptyInbox}
          </p>
        </div>
      ) : (
        <div className="space-y-0.5">
          {threads.map((thread) => (
            <ConversationRow
              key={thread.distribution_id}
              thread={thread}
              isActive={active.type === "conversation" && active.id === thread.distribution_id}
              onOpen={() => onOpen(thread.distribution_id)}
              onToggleFavorite={() => onToggleFavorite(thread.distribution_id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
