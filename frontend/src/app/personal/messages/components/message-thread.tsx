"use client";

import { useEffect, useRef, useState } from "react";
import { SendHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { Message } from "../apis/types";

interface MessageThreadProps {
  messages: Message[];
  currentUserId: number | null;
  loading: boolean;
  sending: boolean;
  disabled: boolean;
  onSend: (content: string) => void;
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function MessageThread({
  messages,
  currentUserId,
  loading,
  sending,
  disabled,
  onSend,
}: Readonly<MessageThreadProps>) {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const submit = () => {
    const content = draft.trim();
    if (!content || sending || disabled) return;
    onSend(content);
    setDraft("");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {loading &&
          [0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-2/3" />)}

        {!loading &&
          messages.map((message) => {
            const mine = message.sender_id === currentUserId;
            return (
              <div key={message.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[75%] rounded-2xl px-4 py-2 text-sm",
                    mine ? "bg-primary text-primary-foreground" : "bg-muted",
                  )}
                >
                  {!mine && <p className="mb-0.5 text-xs font-medium opacity-70">{message.sender_name}</p>}
                  {message.content && <p className="whitespace-pre-wrap break-words">{message.content}</p>}
                  {message.file_url && (
                    <a
                      href={message.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-2"
                    >
                      {message.file_name ?? "Attachment"}
                    </a>
                  )}
                  <p className="mt-1 text-[10px] opacity-60">{timeOf(message.created_at)}</p>
                </div>
              </div>
            );
          })}
        <div ref={endRef} />
      </div>

      <div className="flex items-end gap-2 border-t p-3">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={disabled ? "This conversation is closed" : "Write a message…"}
          disabled={disabled}
          rows={1}
          className="max-h-32 min-h-10 resize-none"
          aria-label="Message"
        />
        <Button type="button" size="icon" onClick={submit} disabled={disabled || sending || !draft.trim()}>
          <SendHorizontal className="size-4" />
          <span className="sr-only">Send</span>
        </Button>
      </div>
    </div>
  );
}
