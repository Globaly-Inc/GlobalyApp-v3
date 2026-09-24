"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { POLL_MS } from "@/components/chat/const";
import { businessMessagesApi } from "../apis";
import {
  deleteMessage,
  editMessage,
  fetchThreadMessages,
  fetchThreads,
  markThreadRead,
  sendThreadMessage,
  toggleMessagePin,
  toggleMessageReaction,
  toggleMessageStar,
  toggleThreadFavorite,
} from "../store/business-messages-slice";
import { ChatInfoPanel } from "@/components/chat/chat-info-panel";
import { ConversationHeader } from "@/components/chat/conversation-header";
import { MessageComposer } from "@/components/chat/message-composer";
import { MessageList } from "@/components/chat/message-list";
import { ThreadPanel } from "./thread-panel";
import type { EnquiryMessage, ChatThread } from "@/components/chat/types";

/**
 * One open conversation: header, scrolling history, composer, and the right-hand info
 * panel — GlobalyOS V2's `ConversationView` beside its `ChatRightPanelEnhanced`, which V2
 * mounts at `w-80` and hides below its desktop breakpoint. V2's thread pane is dropped:
 * replies-in-thread don't exist on the student side.
 */
export function ConversationView({
  thread,
  highlightMessageId,
  onBack,
}: Readonly<{ thread: ChatThread; highlightMessageId: number | null; onBack: () => void }>) {
  const dispatch = useAppDispatch();
  const threads = useAppSelector((st) => st.businessMessages.threads);
  const id = thread.distribution_id;
  const messages = useAppSelector((s) => s.businessMessages.byDistribution[id]) ?? [];
  const status = useAppSelector((s) => s.businessMessages.status[id]) ?? "idle";

  // A jump asked for from inside this conversation (the info panel's pinned rows), as
  // opposed to the one handed down from a search hit or the Starred view. Cleared right
  // after so clicking the same row twice scrolls both times.
  const [panelJumpId, setPanelJumpId] = useState<number | null>(null);
  const jumpToMessage = useCallback((messageId: number) => {
    setPanelJumpId(messageId);
    setTimeout(() => setPanelJumpId(null), 100);
  }, []);

  // The open thread, by parent id. Held as an id rather than the message object so the
  // panel always renders the store's current copy (reply counts, reactions, pins move).
  const [threadParentId, setThreadParentId] = useState<number | null>(null);
  const openThread = useCallback((message: EnquiryMessage) => {
    // Threads are one level deep, so clicking Reply on a reply opens its parent's thread.
    setThreadParentId(message.reply_to_id ?? message.id);
  }, []);
  const threadParent = threadParentId === null ? null : (messages.find((m) => m.id === threadParentId) ?? null);

  // Keyed on the thread id rather than a bare boolean: switching conversations must
  // fetch the new one, but React Strict Mode's double-invoke must not double-fetch it.
  const fetchedRef = useRef<string | null>(null);
  useEffect(() => {
    if (fetchedRef.current !== id) {
      fetchedRef.current = id;
      // A thread from the previous conversation must not stay open over this one.
      setThreadParentId(null);
      dispatch(fetchThreadMessages(id));
      // Opening a thread is what marks it read — same as V2, which marks read once the
      // reader reaches the bottom of the list.
      dispatch(markThreadRead(id));
    }
    if (thread.is_closed) return; // nothing new can arrive on a closed thread
    const timer = setInterval(() => dispatch(fetchThreadMessages(id)), POLL_MS);
    return () => clearInterval(timer);
  }, [dispatch, id, thread.is_closed]);

  const handleEdit = async (messageId: number, body: string): Promise<boolean> => {
    const result = await dispatch(editMessage({ messageId, body, distributionId: id }));
    if (editMessage.rejected.match(result)) {
      toast.error("Couldn't save the edit", { description: result.error.message ?? "Please try again." });
      return false;
    }
    return true;
  };

  const handleDelete = async (messageId: number) => {
    const result = await dispatch(deleteMessage({ messageId, distributionId: id }));
    if (deleteMessage.rejected.match(result)) {
      toast.error("Couldn't delete", { description: result.error.message ?? "Please try again." });
      return;
    }
    // A deleted parent has no thread left to show.
    if (messageId === threadParentId) setThreadParentId(null);
  };

  const handleSend = async (body: string, attachments: string[]): Promise<boolean> => {
    const result = await dispatch(sendThreadMessage({ distributionId: id, body, attachments }));
    if (sendThreadMessage.rejected.match(result)) {
      toast.error("Couldn't send", { description: result.error.message ?? "Please try again." });
      return false;
    }
    return true;
  };

  /**
   * Forwarding is just a send into a DIFFERENT thread, so it reuses the same thunk. The
   * dialog owns the toast for success and failure; this only reports which way it went.
   */
  const handleForward = async (toDistributionId: string, body: string): Promise<boolean> => {
    const result = await dispatch(sendThreadMessage({ distributionId: toDistributionId, body }));
    return !sendThreadMessage.rejected.match(result);
  };

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col bg-background">
        <ConversationHeader
          thread={thread}
          messages={messages}
          enquiryHref="/business/enquiries"
          onBack={onBack}
          onToggleFavorite={() => dispatch(toggleThreadFavorite(id))}
          // Admins only. The new name is shared, so the thread list has to be re-read rather than
          // patched locally — the sidebar row, search and Forward all render the same label.
          onRename={
            thread.my_role === "admin"
              ? async (title) => {
                  await businessMessagesApi.renameThread(id, title);
                  dispatch(fetchThreads());
                }
              : undefined
          }
          // Upload, then point the thread at the path that came back — the same two steps the
          // composer takes for an attachment, and the reason the server can verify the uploader.
          onChangePhoto={
            thread.my_role === "admin"
              ? async (file) => {
                  const { storage_path } = await businessMessagesApi.uploadAttachment(file);
                  await businessMessagesApi.setThreadPhoto(id, storage_path);
                  dispatch(fetchThreads());
                }
              : undefined
          }
        />

        {/* Keyed so switching conversations remounts both: the list resets its scroll
            position and the composer re-reads that thread's draft. */}
        <MessageList
          key={id}
          messages={messages}
          status={status}
          counterpartName={thread.counterpart_name}
          highlightMessageId={panelJumpId ?? highlightMessageId}
          // Pinning changes what BOTH sides see, so a read-only thread cannot be pinned to.
          canPin={!thread.is_closed}
          canReact={!thread.is_closed}
          canModify={!thread.is_closed}
          distributionId={id}
          onToggleStar={(messageId) => dispatch(toggleMessageStar({ messageId, distributionId: id }))}
          onTogglePin={(messageId) => dispatch(toggleMessagePin({ messageId, distributionId: id }))}
          onToggleReaction={(messageId, emoji) =>
            dispatch(toggleMessageReaction({ messageId, emoji, distributionId: id }))
          }
          onOpenThread={openThread}
          onEdit={handleEdit}
          onDelete={handleDelete}
          // Forward destinations come from the same inbox the sidebar renders.
          forwardThreads={threads}
          onForward={handleForward}
        />

        {thread.is_closed ? (
          <p className="shrink-0 border-t border-border p-4 text-xs text-muted-foreground">
            This enquiry is closed. The conversation with {thread.counterpart_name} stays readable, but no new
            messages can be sent.
          </p>
        ) : (
          <div className="shrink-0 border-t border-border">
            <MessageComposer
              key={id}
              distributionId={id}
              counterpartName={thread.counterpart_name}
              onUploadAttachment={businessMessagesApi.uploadAttachment}
              onSend={handleSend}
            />
          </div>
        )}
      </div>

      {/* Hidden below lg: at md, the sidebar plus a 20rem panel leaves the messages
          themselves too narrow to read. V2 hides it on the same reasoning.
          An open thread takes this slot from the info panel, as it does in V2. */}
      <div className="hidden w-80 shrink-0 border-l border-border lg:block">
        {threadParent ? (
          <ThreadPanel
            parent={threadParent}
            distributionId={id}
            canReply={!thread.is_closed}
            onClose={() => setThreadParentId(null)}
          />
        ) : (
          <ChatInfoPanel
            messages={messages}
            onJumpToMessage={jumpToMessage}
            distributionId={id}
            showMembers
            // Leaving removes this thread from their inbox, so the open conversation has to close
            // with it — the list is the authority for what may be selected.
            onLeft={() => {
              dispatch(fetchThreads());
              onBack();
            }}
          />
        )}
      </div>
    </div>
  );
}
