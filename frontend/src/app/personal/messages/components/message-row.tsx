"use client";

import { useState } from "react";
import { Bookmark, MessageSquare, Pin } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { initials, messageTime } from "../utils";
import { AttachmentList } from "./attachment-list";
import { ForwardMessageDialog } from "./forward-message-dialog";
import { MessageActions } from "./message-actions";
import { MessageEditInput } from "./message-edit-input";
import { MessageReactions } from "./message-reactions";
import { RichTextMessage } from "./rich-text-message";
import type { EnquiryMessage } from "../apis/types";

/**
 * One message, in GlobalyOS V2's `MessageBubble` layout: a left gutter for the avatar,
 * name + time above the text, and NO bubble — both sides read as the same left-aligned
 * row, with only the sender name tinted for your own messages. (The previous student
 * chat used mirrored chat bubbles; V2 does not, so neither does this.)
 *
 * A grouped message (same sender within five minutes) keeps the gutter but drops the
 * avatar and the header line, exactly as V2 does.
 *
 * Thread replies never reach the main list — the server excludes them, and the parent's
 * "N replies" link is the only trace of them there, as in V2.
 */
export function MessageRow({
  message,
  isGrouped,
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
}: Readonly<{
  message: EnquiryMessage;
  isGrouped: boolean;
  canPin: boolean;
  canReact: boolean;
  /** False on a closed thread — editing and deleting are writes. */
  canModify: boolean;
  /** Needed by Forward, to exclude the conversation the message came from. */
  distributionId: string;
  onToggleStar: () => void;
  onTogglePin: () => void;
  onToggleReaction: (emoji: string) => void;
  /** Absent inside a thread panel — threads are one level deep. */
  onOpenThread?: () => void;
  /** Resolves false on failure, so the editor stays open with the text intact. */
  onEdit: (body: string) => Promise<boolean>;
  onDelete: () => void;
}>) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [forwarding, setForwarding] = useState(false);

  const handleSave = async (body: string) => {
    setSaving(true);
    const ok = await onEdit(body);
    setSaving(false);
    if (ok) setEditing(false);
  };

  return (
    <div
      id={`message-${message.id}`}
      className={cn(
        "group relative flex gap-1.5 px-1.5 py-0.5 transition-colors duration-150 hover:bg-muted/40 md:gap-3 md:px-4",
        !isGrouped && "md:py-1",
        // V2 tints a pinned row amber so it is findable while scrolling, not only in the panel.
        message.is_pinned && "bg-amber-500/5 hover:bg-amber-500/10",
      )}
    >
      <div className="w-7 shrink-0 md:w-9">
        {!isGrouped && (
          <Avatar className="size-7 md:size-9">
            {message.sender_avatar && <AvatarImage src={message.sender_avatar} alt={message.sender_name} />}
            <AvatarFallback className="bg-primary/10 text-[10px] font-medium text-primary md:text-xs">
              {initials(message.sender_name)}
            </AvatarFallback>
          </Avatar>
        )}
      </div>

      <div className="min-w-0 flex-1">
        {!isGrouped && (
          <div className="mb-0.5 flex items-center gap-2">
            <span className={cn("text-sm font-semibold", message.is_mine ? "text-primary" : "text-foreground")}>
              {message.sender_name}
            </span>
            <span className="text-xs text-muted-foreground">{messageTime(message.created_at)}</span>
          </div>
        )}

        {/* An attachment-only message has no body to render. */}
        {editing ? (
          <MessageEditInput
            initialBody={message.body}
            saving={saving}
            onSave={handleSave}
            onCancel={() => setEditing(false)}
          />
        ) : (
          message.body && (
            <div className="text-sm leading-relaxed text-foreground">
              <RichTextMessage body={message.body} />
              {message.edited_at && <span className="ml-1 text-xs text-muted-foreground">(edited)</span>}
            </div>
          )
        )}

        <AttachmentList attachments={message.attachments} />

        <MessageReactions reactions={message.reactions} canReact={canReact} onToggle={onToggleReaction} />

        {/* V2's reply-count link under the message, opening the thread panel. */}
        {onOpenThread && message.reply_count > 0 && (
          <button
            type="button"
            onClick={onOpenThread}
            className="mt-1.5 flex cursor-pointer items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <MessageSquare className="size-3" aria-hidden />
            {message.reply_count} {message.reply_count === 1 ? "reply" : "replies"}
          </button>
        )}

        {(message.is_pinned || message.is_starred) && (
          <div className="mt-1.5 flex items-center gap-2">
            {message.is_pinned && (
              <span className="flex items-center gap-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                <Pin className="size-3" aria-hidden />
                Pinned
              </span>
            )}
            {message.is_starred && (
              <span className="flex items-center gap-0.5 text-xs text-blue-500">
                <Bookmark className="size-3 fill-blue-500" aria-hidden />
                Starred
              </span>
            )}
          </div>
        )}
      </div>

      {/* Hidden while editing: the toolbar would sit over the editor's own buttons. */}
      {!editing && (
        <MessageActions
          body={message.body}
          messageId={message.id}
          isOwn={message.is_mine}
          isStarred={message.is_starred}
          isPinned={message.is_pinned}
          canPin={canPin}
          canModify={canModify}
          onToggleStar={onToggleStar}
          onTogglePin={onTogglePin}
          onReply={onOpenThread}
          onEdit={() => setEditing(true)}
          onDelete={onDelete}
          onForward={() => setForwarding(true)}
        />
      )}

      <ForwardMessageDialog
        body={message.body}
        fromDistributionId={distributionId}
        open={forwarding}
        onOpenChange={setForwarding}
      />
    </div>
  );
}
