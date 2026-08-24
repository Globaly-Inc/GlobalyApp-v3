"use client";

import { Check, CheckCheck, MessageCircle } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { markThreadRead } from "../store/business-messages-slice";
import { fullStamp, initials, previewText } from "@/components/chat/utils";
import { SpecialViewHeader } from "@/components/chat/special-view-header";
import type { ChatThread } from "@/components/chat/types";

/**
 * The Unread shortcut — GlobalyOS V2's `UnreadView`: bordered cards, the sender's
 * avatar, a secondary badge naming the conversation, a two-line preview, the full
 * timestamp, a hover-revealed per-row tick, and a "Mark all as read" bar.
 *
 * V2 lists individual unread MESSAGES (and reactions) from a dedicated endpoint. Here a
 * row is a conversation with its unread count and newest message, because the inbox
 * query already returns exactly that — no second endpoint, and the row still lands you
 * on the same place when clicked.
 */
export function UnreadView({
  threads,
  onBack,
  onOpen,
}: Readonly<{ threads: ChatThread[]; onBack: () => void; onOpen: (distributionId: string) => void }>) {
  const dispatch = useAppDispatch();
  const loading = useAppSelector((s) => s.businessMessages.threadsStatus) === "loading";
  const unread = threads.filter((t) => t.unread_count > 0);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <SpecialViewHeader
        type="unread"
        onBack={onBack}
        action={
          <Button
            variant="ghost"
            size="sm"
            disabled={unread.length === 0}
            onClick={() => unread.forEach((t) => dispatch(markThreadRead(t.distribution_id)))}
          >
            <CheckCheck className="size-4" />
            <span className="hidden sm:inline">Mark all as read</span>
          </Button>
        }
      />

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {loading && unread.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
        ) : unread.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <MessageCircle className="mx-auto mb-3 size-12 opacity-30" aria-hidden />
            <p>No unread messages</p>
            <p className="mt-1 text-sm">You&apos;re all caught up!</p>
          </div>
        ) : (
          unread.map((thread) => (
            <div key={thread.distribution_id} className="group relative">
              <button
                type="button"
                onClick={() => onOpen(thread.distribution_id)}
                className="w-full cursor-pointer rounded-lg border border-border bg-background p-3 text-left transition-colors hover:bg-muted"
              >
                <div className="flex items-start gap-3">
                  <Avatar className="size-10 shrink-0">
                    {thread.counterpart_avatar && <AvatarImage src={thread.counterpart_avatar} alt={thread.counterpart_name} />}
                    <AvatarFallback className="text-xs">{initials(thread.counterpart_name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2 pr-8">
                      <span className="truncate text-sm font-medium">{thread.counterpart_name}</span>
                      <Badge variant="secondary" className="shrink-0 text-xs">
                        {thread.unread_count} new
                      </Badge>
                    </div>
                    <p className="line-clamp-2 text-sm text-muted-foreground">
                      {thread.last_message_body ? previewText(thread.last_message_body) : thread.course_name}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {fullStamp(thread.last_message_at ?? thread.unlocked_at)}
                    </p>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => dispatch(markThreadRead(thread.distribution_id))}
                aria-label={`Mark ${thread.counterpart_name} as read`}
                title="Mark as read"
                className="absolute right-2 top-2 flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
              >
                <Check className="size-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
