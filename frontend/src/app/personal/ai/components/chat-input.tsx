"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Paperclip, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const MAX_ATTACHMENTS = 3;

type ChatInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: (content: string, files?: File[]) => void;
  disabled?: boolean;
  /** Show the paperclip. Off for unauthenticated surfaces (embed widget) — uploads need a session. */
  allowAttachments?: boolean;
};

export function ChatInput({ value, onChange, onSend, disabled, allowAttachments }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);

  // A starter or chip fills the box from outside, so pull focus over to it — otherwise the user
  // has to click into the textarea before they can edit or press Enter. Typing already has focus,
  // so the guard makes this a no-op for the keystroke case.
  useEffect(() => {
    const el = textareaRef.current;
    if (el && value && document.activeElement !== el) el.focus();
  }, [value]);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed, files.length ? files : undefined);
    setFiles([]);
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
    <div className="border-t bg-background p-3">
      <div className="mx-auto max-w-3xl">
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
        {/* The ring lives on the wrapper so the textarea and the send button read as one control;
            the textarea's own border/ring is suppressed to avoid a double outline. */}
        <div className="flex items-end gap-2 rounded-3xl border bg-card p-1.5 pl-3 shadow-sm transition-shadow focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
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
                className="size-9 self-end rounded-full"
              >
                <Paperclip className="size-4" />
              </Button>
            </>
          )}
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about courses, admissions, scholarships..."
            disabled={disabled}
            rows={1}
            className="max-h-32 min-h-9 resize-none self-center border-transparent bg-transparent px-0 py-2 shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
          />
          <Button
            size="icon"
            onClick={submit}
            disabled={disabled || !value.trim()}
            aria-label="Send message"
            className="size-9 rounded-full"
          >
            <Send className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
