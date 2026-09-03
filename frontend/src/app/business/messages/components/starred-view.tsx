"use client";

import { useEffect, useRef } from "react";
import { Bookmark, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchStarredMessages, toggleMessageStar } from "../store/business-messages-slice";
import { fullStamp, initials, previewText } from "@/components/chat/utils";
import { SpecialViewHeader } from "@/components/chat/special-view-header";

/**
 * The Starred shortcut — GlobalyOS V2's `StarredView`: bordered cards, sender avatar, a
 * secondary badge naming the conversation the message came from, a two-line excerpt, the
 * full timestamp, and an X that un-stars it in place.
 *
 * Starred is per MESSAGE here exactly as in V2 (`chat_message_stars` →
 * `enquiry_message_stars`) — that is the distinction from Favorites, which pins whole
 * conversations to the sidebar.
 */
export function StarredView({
  onBack,
  onOpen,
}: Readonly<{ onBack: () => void; onOpen: (distributionId: string, messageId: number) => void }>) {
  const dispatch = useAppDispatch();
  const { starred, starredStatus } = useAppSelector((s) => s.businessMessages);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchStarredMessages());
  }, [dispatch]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <SpecialViewHeader type="starred" onBack={onBack} />

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {starredStatus === "loading" && starred.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
        ) : starredStatus === "failed" && starred.length === 0 ? (
          <p className="py-8 text-center text-sm text-destructive">Couldn&apos;t load your starred messages.</p>
        ) : starred.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <Bookmark className="mx-auto mb-3 size-12 opacity-30" aria-hidden />
            <p>No starred messages</p>
            <p className="mt-1 text-sm">Bookmark important messages to find them easily</p>
          </div>
        ) : (
          starred.map((message) => (
            <button
              key={message.id}
              type="button"
              onClick={() => onOpen(message.distribution_id, message.id)}
              className="w-full cursor-pointer rounded-lg border border-border bg-background p-3 text-left transition-colors hover:bg-muted"
            >
              <div className="flex items-start gap-3">
                <Avatar className="size-10 shrink-0">
                  {message.sender_avatar && <AvatarImage src={message.sender_avatar} alt={message.sender_name} />}
                  <AvatarFallback className="text-xs">{initials(message.sender_name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{message.sender_name}</span>
                    <Badge variant="secondary" className="min-w-0 shrink text-xs">
                      <span className="truncate">{message.counterpart_name}</span>
                    </Badge>
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label="Remove from starred"
                      title="Remove from starred"
                      onClick={(e) => {
                        e.stopPropagation();
                        dispatch(
                          toggleMessageStar({ messageId: message.id, distributionId: message.distribution_id }),
                        );
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter" && e.key !== " ") return;
                        e.stopPropagation();
                        dispatch(
                          toggleMessageStar({ messageId: message.id, distributionId: message.distribution_id }),
                        );
                      }}
                      className="ml-auto flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-destructive"
                    >
                      <X className="size-3.5" />
                    </span>
                  </div>
                  <p className="line-clamp-2 text-sm text-muted-foreground">{previewText(message.body)}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{fullStamp(message.created_at)}</p>
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
