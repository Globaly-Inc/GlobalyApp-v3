"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowUp, CornerUpLeft, Paperclip, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { setReplyTo } from "../store/ai-chat-slice";
import { withQuote } from "../utils";
import { cn } from "@/lib/utils";

const MAX_ATTACHMENTS = 3;

type ChatInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: (content: string, files?: File[]) => void;
  disabled?: boolean;
  /** Show the paperclip. Off for unauthenticated surfaces (embed widget) — uploads need a session. */
  allowAttachments?: boolean;
  /** Drop the docked padding/gradient — for the centred empty-state hero, where the box isn't pinned to the bottom. */
  bare?: boolean;
};

export function ChatInput({ value, onChange, onSend, disabled, allowAttachments, bare }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const dispatch = useAppDispatch();
  const replyTo = useAppSelector((s) => s.aiChat.replyTo);

  // A starter or chip fills the box from outside, so pull focus over to it — otherwise the user
  // has to click into the textarea before they can edit or press Enter. Typing already has focus,
  // so the guard makes this a no-op for the keystroke case.
  useEffect(() => {
    const el = textareaRef.current;
    if (el && value && document.activeElement !== el) el.focus();
  }, [value]);

  // Hitting Reply on a message should drop the cursor straight into the composer.
  useEffect(() => {
    if (replyTo) textareaRef.current?.focus();
  }, [replyTo]);

  // Grow with the content up to the max height, then scroll. Height resets to auto
  // first, or the box only ratchets taller — scrollHeight keeps reporting the
  // previous height once one is set inline.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  // A reply rides along as a leading markdown quote in the message text, so every
  // send path (page, popover, embed) carries it without touching the API contract.
  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(replyTo ? withQuote(trimmed, replyTo.content) : trimmed, files.length ? files : undefined);
    setFiles([]);
    if (replyTo) dispatch(setReplyTo(null));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list)].slice(0, MAX_ATTACHMENTS));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    // No top border: the gradient lets the last message scroll away under the
    // composer instead of stopping dead at a rule. `bare` drops that entirely —
    // in the hero the box floats mid-panel, with nothing scrolling under it.
    <div
      className={cn(
        "relative shrink-0",
        !bare && "bg-gradient-to-t from-background via-background to-transparent px-4 pb-3 pt-6 sm:px-6",
      )}
    >
      <div className="mx-auto max-w-3xl">
        {replyTo && (
          <div className="mb-2 flex items-start gap-2 rounded-xl border border-l-2 border-l-primary bg-muted/60 px-3 py-2">
            <CornerUpLeft className="mt-0.5 size-3.5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-muted-foreground">
                Replying to {replyTo.role === "user" ? "your message" : "AI Counsellor"}
              </p>
              <p className="line-clamp-2 text-xs text-muted-foreground">{replyTo.content}</p>
            </div>
            <button
              type="button"
              onClick={() => dispatch(setReplyTo(null))}
              aria-label="Cancel reply"
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}
        {files.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {files.map((file, i) => (
              <span
                key={`${file.name}-${i}`}
                className="flex items-center gap-1 rounded-full border bg-muted px-2.5 py-1 text-xs"
              >
                <Paperclip className="size-3" />
                <span className="max-w-40 truncate">{file.name}</span>
                <button
                  type="button"
                  onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                  aria-label={`Remove ${file.name}`}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        {/* Two rows inside one control: the prompt gets the full width, the actions sit on
            their own toolbar underneath. The ring lives on the wrapper so both rows read as
            one box; the textarea's own border/ring is suppressed to avoid a double outline. */}
        <div className="rounded-3xl border bg-card p-2 shadow-lg transition-shadow focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="How can I help you today?"
            disabled={disabled}
            rows={1}
            className="max-h-48 min-h-9 w-full resize-none overflow-y-auto border-transparent bg-transparent px-2 py-1.5 text-[0.9375rem] shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
          />
          <div className="flex items-center gap-1 pt-1">
            {allowAttachments && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  hidden
                  multiple
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.txt,.csv"
                  onChange={(e) => addFiles(e.target.files)}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={disabled || files.length >= MAX_ATTACHMENTS}
                  aria-label="Attach file"
                  className="size-8 rounded-full"
                >
                  <Plus className="size-4" />
                </Button>
              </>
            )}
            <Button
              size="icon"
              onClick={submit}
              disabled={disabled || !value.trim()}
              aria-label="Send message"
              className="ml-auto size-8 rounded-full"
            >
              <ArrowUp className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
