"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type ChatInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: (content: string) => void;
  disabled?: boolean;
};

export function ChatInput({ value, onChange, onSend, disabled }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    onSend(trimmed);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="border-t bg-background p-3">
      {/* The ring lives on the wrapper so the textarea and the send button read as one control;
          the textarea's own border/ring is suppressed to avoid a double outline. */}
      <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-3xl border bg-card p-1.5 pl-3 shadow-sm transition-shadow focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
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
  );
}
