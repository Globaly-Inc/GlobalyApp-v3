"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import {
  deleteMessage,
  editMessage,
  fetchThreadReplies,
  sendThreadReply,
  toggleMessageReaction,
  toggleMessageStar,
} from "../store/messages-slice";
import { MessageComposer } from "./message-composer";
import { MessageRow } from "./message-row";
import type { EnquiryMessage } from "../apis/types";

/**
 * The right-hand Thread panel — GlobalyOS V2's `ThreadView`: the parent message at the
 * top, a "N replies" divider, the replies below it, and a composer scoped to the thread.
 * Takes the info panel's slot while a thread is open, exactly as V2 swaps
 * `ThreadView` in for `ChatRightPanelEnhanced`.
 *
 * The composer sits INSIDE the scroll column, directly under the last reply, rather than
 * pinned to the panel's bottom edge — that is how V2 lays it out, and in a 20rem-wide
 * panel a floor-pinned composer leaves a long dead gap under a short thread.
 *
 * Threads are one level deep — a reply has no reply affordance of its own, and the server
 * anchors a reply-to-a-reply onto its parent. Every other message action (star, copy,
 * forward, and edit/delete on your own) works here exactly as it does in the main list.
 */
export function ThreadPanel({
  parent,
  distributionId,
  canReply,
  onClose,
}: Readonly<{
  parent: EnquiryMessage;
  distributionId: string;
  /** False on a closed thread — replying writes to a read-only conversation. */
  canReply: boolean;
  onClose: () => void;
}>) {
  const dispatch = useAppDispatch();
  // The parent of a thread is always a top-level message, so this key matches what the
  // server groups replies under.
  const parentId = parent.reply_to_id ?? parent.id;
  const replies = useAppSelector((s) => s.messages.repliesByParent[parentId]) ?? [];
  const status = useAppSelector((s) => s.messages.repliesStatus[parentId]) ?? "idle";

  // Keyed on the parent so opening a different thread refetches, without Strict Mode's
  // double-invoke firing two requests for the same one.
  const fetchedRef = useRef<number | null>(null);
  useEffect(() => {
    if (fetchedRef.current === parentId) return;
    fetchedRef.current = parentId;
    dispatch(fetchThreadReplies(parentId));
  }, [dispatch, parentId]);

  const handleSend = async (body: string, attachments: string[]): Promise<boolean> => {
    const result = await dispatch(sendThreadReply({ messageId: parentId, body, attachments, distributionId }));
    if (sendThreadReply.rejected.match(result)) {
      toast.error("Couldn't reply", { description: result.error.message ?? "Please try again." });
      return false;
    }
    return true;
  };

  const react = (messageId: number, emoji: string) =>
    dispatch(toggleMessageReaction({ messageId, emoji, distributionId }));

  const handleEdit = async (messageId: number, body: string): Promise<boolean> => {
    const result = await dispatch(editMessage({ messageId, body, distributionId }));
    if (editMessage.rejected.match(result)) {
      toast.error("Couldn't save the edit", { description: result.error.message ?? "Please try again." });
      return false;
    }
    return true;
  };

  const handleDelete = async (messageId: number) => {
    const result = await dispatch(deleteMessage({ messageId, distributionId }));
    if (deleteMessage.rejected.match(result)) {
      toast.error("Couldn't delete", { description: result.error.message ?? "Please try again." });
      return;
    }
    // Deleting the message the thread hangs off leaves nothing to show.
    if (messageId === parentId) onClose();
  };

  /** Every row here gets the same toolbar as the main list, minus the reply affordance —
   *  you are already inside the thread, and threads are one level deep. */
  const rowActions = (message: EnquiryMessage) => ({
    canPin: false,
    canReact: canReply,
    canModify: canReply,
    distributionId,
    onToggleStar: () => void dispatch(toggleMessageStar({ messageId: message.id, distributionId })),
    onTogglePin: () => {},
    onToggleReaction: (emoji: string) => void react(message.id, emoji),
    onEdit: (body: string) => handleEdit(message.id, body),
    onDelete: () => void handleDelete(message.id),
  });

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold">Thread</h3>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close thread">
          <X className="size-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* The parent, without its own reply affordance — you are already in its thread. */}
        <MessageRow message={parent} isGrouped={false} {...rowActions(parent)} />

        <div className="my-2 flex items-center gap-3 px-4">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs font-medium text-muted-foreground">
            {status === "loading" && replies.length === 0
              ? "Loading replies…"
              : `${replies.length} ${replies.length === 1 ? "reply" : "replies"}`}
          </span>
          <div className="h-px flex-1 bg-border" />
        </div>

        {status === "loading" && replies.length === 0 ? (
          <div className="space-y-3 px-4 pb-4">
            {[0, 1].map((i) => (
              <div key={i} className="flex gap-2">
                <Skeleton className="size-7 shrink-0 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : status === "failed" && replies.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-destructive">Couldn&apos;t load the replies.</p>
        ) : (
          replies.map((reply, i) => (
            <MessageRow
              key={reply.id}
              message={reply}
              // Replies group by sender the same way the main thread does.
              isGrouped={i > 0 && replies[i - 1]!.sender_id === reply.sender_id}
              {...rowActions(reply)}
            />
          ))
        )}

        {canReply ? (
          /* Keyed by parent so switching threads clears whatever was half-typed.
             persistDraft=false: a thread reply is not a conversation, so it must not
             appear in the Drafts shortcut. */
          <MessageComposer
            key={`thread-${parentId}`}
            distributionId={distributionId}
            businessName=""
            placeholder="Reply…"
            persistDraft={false}
            compact
            onSend={handleSend}
          />
        ) : (
          <p className="p-4 text-xs text-muted-foreground">
            This enquiry is closed — the thread stays readable, but no new replies can be sent.
          </p>
        )}
      </div>
    </div>
  );
}
