"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/** The shape any thread needs to render. Both enquiry chat and order messages match it. */
export type ThreadMessage = {
  id: number;
  body: string;
  created_at: string;
  sender_name: string;
  /** Signed URL. Absent or null falls back to the sender's initial. */
  sender_avatar?: string | null;
  is_mine: boolean;
};

/**
 * Why the composer is or isn't usable. `locked` means "not yet" (a precondition is
 * unmet), `closed` means "no longer" — different sentences, and the caller supplies
 * both because only it knows the domain reason.
 */
export type ComposerState = "open" | "locked" | "closed";

/**
 * `inline` sits inside a card and caps its own height. `fill` expands to whatever the
 * parent gives it and puts the composer on the bottom edge — the full-page chat window.
 */
export type ThreadLayout = "inline" | "fill";

const formatStamp = (iso: string) =>
  new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));

/**
 * Presentational message thread — flat message rows, states, composer. No store, no fetching:
 * callers own the data and pass `onSend`, so the same component serves the enquiry chat
 * and the other-services order thread it was extracted from.
 */
export function MessageThread({
  messages,
  status,
  counterpartyName,
  composerState = "open",
  hint,
  emptyText,
  onSend,
  layout = "inline",
  className,
}: Readonly<{
  messages: ThreadMessage[];
  status: "idle" | "loading" | "failed";
  counterpartyName: string;
  composerState?: ComposerState;
  /** Shown instead of the composer when locked or closed. */
  hint?: string;
  emptyText?: string;
  onSend: (body: string) => Promise<boolean>;
  layout?: ThreadLayout;
  className?: string;
}>) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const fill = layout === "fill";

  // Pinned to the newest message. Depends on the count, not the array, so a poll that
  // returns the same messages doesn't yank the view while someone is reading back.
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const handleSend = async () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    setSending(true);
    const ok = await onSend(trimmed);
    setSending(false);
    // Cleared only on success, so a failed send does not lose what the person typed.
    if (ok) setBody("");
  };

  return (
    <div className={cn(fill ? "flex min-h-0 flex-1 flex-col" : "space-y-3", className)}>
      {status === "loading" && messages.length === 0 && (
        <div className={cn("flex justify-center py-6", fill && "flex-1 items-center")}>
          <Loader2 className="size-5 animate-spin text-primary" aria-hidden />
        </div>
      )}

      {status === "failed" && (
        <p className={cn("py-4 text-center text-sm text-destructive", fill && "flex-1")}>Couldn&apos;t load the conversation.</p>
      )}

      {status !== "loading" && status !== "failed" && messages.length === 0 && (
        <p
          className={cn(
            "rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground",
            fill && "m-4 flex-1",
          )}
        >
          {emptyText ?? `No messages yet — say hello to ${counterpartyName}.`}
        </p>
      )}

      {messages.length > 0 && (
        <div className={cn("space-y-1 overflow-y-auto overflow-x-hidden", fill ? "min-h-0 flex-1 py-3" : "max-h-96 pr-1")}>
          {messages.map((m) => (
            // Flat rows, as in the chat inbox: avatar, name + time, body. Your own messages
            // keep a light primary tint so the two sides still read apart at a glance.
            <div
              key={m.id}
              className={cn("flex gap-3 rounded-lg py-1.5", fill ? "mx-2 px-2" : "px-2", m.is_mine && "bg-primary/5")}
            >
              <Avatar className="size-8 shrink-0">
                {m.sender_avatar && <AvatarImage src={m.sender_avatar} alt={m.sender_name} />}
                <AvatarFallback className="bg-primary/10 text-xs text-primary">
                  {m.sender_name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <p className={cn("text-sm font-semibold", m.is_mine ? "text-primary" : "text-foreground")}>
                    {m.sender_name}
                  </p>
                  <time dateTime={m.created_at} className="text-xs text-muted-foreground">
                    {formatStamp(m.created_at)}
                  </time>
                </div>
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">{m.body}</p>
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
      )}

      {composerState !== "open" ? (
        hint && <p className={cn("text-xs text-muted-foreground", fill && "border-t p-4")}>{hint}</p>
      ) : fill ? (
        <div className="border-t bg-card p-3">
          <div className="flex items-center gap-1 rounded-xl border border-border bg-background py-1 pl-1 pr-1.5 shadow-xs transition-colors focus-within:border-ring/60">
            <Input
              value={body}
              placeholder="Type a message..."
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              disabled={sending}
              className="border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
            />
            <Button
              size="icon-xs"
              className="size-8 shrink-0"
              onClick={handleSend}
              disabled={sending || !body.trim()}
              aria-label="Send message"
            >
              {sending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Textarea
            rows={3}
            value={body}
            placeholder={`Message ${counterpartyName}…`}
            onChange={(e) => setBody(e.target.value)}
            disabled={sending}
            className="rounded-xl"
          />
          <Button className="self-end" onClick={handleSend} disabled={sending || !body.trim()}>
            {sending ? "Sending…" : "Send"}
            <Send data-icon="inline-end" />
          </Button>
        </div>
      )}
    </div>
  );
}
