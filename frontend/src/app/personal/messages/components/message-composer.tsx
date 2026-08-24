"use client";

import { useEffect, useRef, useState } from "react";
import { Bold, Code, Italic, Link, List, ListOrdered, Loader2, Send, Strikethrough } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { messagesApi } from "../apis";
import { MAX_ATTACHMENTS } from "../const";
import { applyFormat, type MarkFormat } from "../utils/markdown";
import { deleteDraft, getDraft, saveDraft } from "../utils/draft-store";
import {
  ACCEPT,
  AttachmentMenu,
  AttachmentPreviews,
  toPending,
  type PendingAttachment,
  type UploadKind,
} from "./composer-attachments";
import { EmojiPicker } from "./emoji-picker";

/**
 * The message composer, ported from GlobalyOS V2's `MessageComposer`.
 *
 * V2's chat composer is a **textarea with a markdown-inserting toolbar**, not a
 * contenteditable editor — the formatting is interpreted at render time by
 * RichTextMessage. That is reproduced exactly here, which is also why nothing new was
 * installed: the repo's tiptap is for the blog's long-form HTML editor, and swapping it
 * in would change the wire format of `enquiry_messages.body` from text to HTML.
 *
 * Attachments upload as soon as they're picked (V2's flow), so pressing Send only posts
 * the storage paths. Dropped from V2: @-mentions (two-party thread), `/` content links,
 * Google Meet, video calls, AI Assist.
 */
const TOOLBAR: ReadonlyArray<{ format: MarkFormat; icon: typeof Bold; label: string; separatorBefore?: boolean }> = [
  { format: "bold", icon: Bold, label: "Bold" },
  { format: "italic", icon: Italic, label: "Italic" },
  { format: "strikethrough", icon: Strikethrough, label: "Strikethrough" },
  { format: "bullet", icon: List, label: "Bullet list", separatorBefore: true },
  { format: "numbered", icon: ListOrdered, label: "Numbered list" },
  { format: "link", icon: Link, label: "Link", separatorBefore: true },
  { format: "code", icon: Code, label: "Code" },
];

export function MessageComposer({
  distributionId,
  businessName,
  placeholder = "Type a message...",
  persistDraft = true,
  compact = false,
  onSend,
}: Readonly<{
  distributionId: string;
  businessName: string;
  placeholder?: string;
  /**
   * The thread panel's variant: no formatting toolbar, no keyboard hint, and an
   * icon-only round send button — matching V2's thread reply box, which is a single
   * line rather than a full composer.
   */
  compact?: boolean;
  /**
   * False in the thread panel. A thread reply is not a conversation, so persisting it
   * would put an un-openable row in the Drafts shortcut — and V2 doesn't persist thread
   * replies either (its ThreadView has its own composer, outside the draft store).
   */
  persistDraft?: boolean;
  /** Resolves false on failure, which is what keeps the typed text in place. */
  onSend: (body: string, attachments: string[]) => Promise<boolean>;
}>) {
  // Lazy initial state, not an effect: the caller keys this component by distribution
  // id, so switching conversations remounts it and the draft is read once on mount.
  const [value, setValue] = useState(() => (persistDraft ? getDraft(distributionId) : ""));
  const [sending, setSending] = useState(false);
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [accept, setAccept] = useState<string>(ACCEPT.file);

  // Every object URL minted here, so none leaks when the component unmounts (which it
  // does on every conversation switch). Append-only and written from event handlers, not
  // render; re-revoking one the send/remove path already released is a no-op.
  const objectUrls = useRef<string[]>([]);
  useEffect(() => () => objectUrls.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const update = (next: string) => {
    setValue(next);
    if (persistDraft) saveDraft(distributionId, businessName, next);
  };

  const format = (mark: MarkFormat) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const result = applyFormat(value, textarea.selectionStart, textarea.selectionEnd, mark);
    update(result.text);
    // The caret has to be restored after React commits the new value, or the browser
    // parks it at the end of the textarea.
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  };

  const insertEmoji = (emoji: string) => {
    const textarea = textareaRef.current;
    const at = textarea?.selectionStart ?? value.length;
    update(`${value.slice(0, at)}${emoji}${value.slice(textarea?.selectionEnd ?? at)}`);
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(at + emoji.length, at + emoji.length);
    });
  };

  const pickFiles = (kind: UploadKind) => {
    setAccept(ACCEPT[kind]);
    // The input's `accept` has to be committed before the picker opens, hence the tick —
    // same reason V2 wraps its click in a setTimeout.
    requestAnimationFrame(() => fileInputRef.current?.click());
  };

  /** Uploads immediately so Send only has to post paths. */
  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const room = MAX_ATTACHMENTS - pending.length;
    if (room <= 0) {
      toast.error(`You can attach up to ${MAX_ATTACHMENTS} files to one message`);
      return;
    }
    const chosen = Array.from(files).slice(0, room);
    if (chosen.length < files.length) {
      toast.error(`Only the first ${chosen.length} added — the limit is ${MAX_ATTACHMENTS} per message`);
    }

    const entries = chosen.map(toPending);
    entries.forEach((e) => e.preview && objectUrls.current.push(e.preview));
    setPending((prev) => [...prev, ...entries]);

    await Promise.all(
      entries.map(async (entry) => {
        try {
          const uploaded = await messagesApi.uploadAttachment(entry.file);
          setPending((prev) =>
            prev.map((p) => (p.key === entry.key ? { ...p, storagePath: uploaded.storage_path } : p)),
          );
        } catch (err) {
          // Marked rather than removed: the person should see which file failed, and be
          // able to drop it themselves.
          setPending((prev) => prev.map((p) => (p.key === entry.key ? { ...p, failed: true } : p)));
          toast.error(`Couldn't upload ${entry.file.name}`, {
            description: err instanceof Error ? err.message : undefined,
          });
        }
      }),
    );
  };

  const removePending = (key: string) => {
    const preview = pending.find((p) => p.key === key)?.preview;
    if (preview) URL.revokeObjectURL(preview);
    setPending((prev) => prev.filter((p) => p.key !== key));
  };

  const uploaded = pending.filter((p) => p.storagePath !== null);
  const uploading = pending.some((p) => p.storagePath === null && !p.failed);

  const handleSend = async () => {
    const trimmed = value.trim();
    // Either text or files — the backend accepts an attachment-only message.
    if ((!trimmed && uploaded.length === 0) || sending || uploading) return;
    setSending(true);
    const ok = await onSend(
      trimmed,
      uploaded.map((p) => p.storagePath!),
    );
    setSending(false);
    // Cleared only on success, so a failed send does not lose what the person typed —
    // and the draft is only dropped once the message is really gone.
    if (ok) {
      setValue("");
      if (persistDraft) deleteDraft(distributionId);
      pending.forEach((p) => p.preview && URL.revokeObjectURL(p.preview));
      setPending([]);
    }
  };

  const canSend = (value.trim().length > 0 || uploaded.length > 0) && !sending && !uploading;

  return (
    <div className="p-3">
      <div className="overflow-hidden rounded-xl border border-border bg-background">
        <AttachmentPreviews pending={pending} onRemove={removePending} />

        {/* Formatting toolbar — desktop only, as in V2 (mobile keyboards cover it), and
            never in the compact thread variant. */}
        <div
          className={cn(
            "items-center gap-0.5 border-b border-border/50 bg-muted/20 px-2 py-1.5",
            compact ? "hidden" : "hidden md:flex",
          )}
        >
          {TOOLBAR.map(({ format: mark, icon: Icon, label, separatorBefore }) => (
            <span key={mark} className="flex items-center">
              {separatorBefore && <Separator orientation="vertical" className="mx-1 h-4" />}
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => format(mark)}
                title={label}
                aria-label={label}
              >
                <Icon className="size-3.5" />
              </Button>
            </span>
          ))}
        </div>

        <Textarea
          ref={textareaRef}
          value={value}
          placeholder={placeholder}
          onChange={(e) => update(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter newlines — V2's handleKeyDown.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
          onPaste={(e) => {
            // Pasting a screenshot should attach it, as it does in V2.
            const files = Array.from(e.clipboardData.files);
            if (files.length === 0) return;
            e.preventDefault();
            void handleFiles(e.clipboardData.files);
          }}
          // [field-sizing:content] grows the box in CSS as V2 does; max-h caps it at
          // roughly seven lines so a long draft never swallows the thread.
          className={cn(
            "resize-none rounded-none border-0 [field-sizing:content] focus-visible:ring-0",
            "overflow-y-auto text-sm",
            // A thread reply is short, so its box starts and stays smaller.
            compact ? "max-h-32 min-h-9" : "max-h-[168px] min-h-[44px]",
          )}
          rows={1}
          disabled={sending}
          // Opening a conversation should leave the caret in the composer, as in V2.
          autoFocus
        />

        <div className="flex items-center justify-between border-t border-border/50 bg-muted/20 px-2 py-1.5">
          <div className="flex items-center gap-0">
            <AttachmentMenu disabled={sending} onPick={pickFiles} />
            <EmojiPicker onSelect={insertEmoji} />
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={accept}
              className="hidden"
              onChange={(e) => {
                void handleFiles(e.target.files);
                // Reset so picking the same file twice in a row still fires onChange.
                e.target.value = "";
              }}
            />
          </div>

          <div className="flex items-center gap-2">
            {/* The hint costs three wrapped lines in the narrow thread panel, so the
                compact variant drops it and keeps only the upload state. */}
            {(!compact || uploading) && (
              <p className="hidden text-[11px] text-muted-foreground sm:block">
                {uploading ? "Uploading…" : "Enter to send · Shift+Enter for a new line"}
              </p>
            )}
            {compact ? (
              <Button
                size="icon-lg"
                className="rounded-full"
                onClick={handleSend}
                disabled={!canSend}
                aria-label="Send reply"
              >
                {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              </Button>
            ) : (
              <Button size="sm" className="h-8 gap-1.5 px-3" onClick={handleSend} disabled={!canSend}>
                {sending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                Send
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
