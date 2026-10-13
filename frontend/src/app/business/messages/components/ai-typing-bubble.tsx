"use client";

import { useEffect, useState } from "react";
import { AlyOrbIcon } from "@/components/aly-orb-icon";
import type { VisitorMessage, WidgetVisitor } from "@/app/business/ai-widget/apis/types";
import { embedChatState } from "../utils";

/**
 * How long after the customer's message the AI can still be on its way: the reply debounce (up to
 * 20s for a burst, CHANNEL_REPLY_MAX_WAIT_MS) plus the model's own time. Past this, no dots — the
 * reply failed or went elsewhere, and the header says who has the conversation.
 */
const TYPING_FOR_MS = 90_000;

/**
 * "…" on our side while an AI reply is on its way — what the customer sees on Instagram and
 * Messenger, shown to the team too. Read off the conversation, with no server state of its own: the
 * AI is handling it and the customer has the last word. Every other outcome (a person takes over, a
 * draft to review, an escalation) changes the conversation's state, and the dots go with it.
 */
export function AiTypingBubble({ visitor, messages }: Readonly<{ visitor: WidgetVisitor; messages: VisitorMessage[] }>) {
  const [now, setNow] = useState(() => Date.now());
  // A clock, so the dots go away on time even if no poll brings a change.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, []);

  const last = messages.at(-1);
  const due = !!last && last.role === "user" && !last.deleted && embedChatState(visitor) === "ai" && now - Date.parse(last.created_at) < TYPING_FOR_MS;
  if (!due) return null;

  return (
    <div className="mt-4 flex flex-col items-end" role="status" aria-label="The AI assistant is writing a reply">
      <p className="mb-1 mr-8 text-xs text-muted-foreground">
        <span className="font-medium text-primary">AI Assistant</span> is typing…
      </p>
      <div className="flex flex-row-reverse items-end gap-2">
        <span className="flex size-6 shrink-0 items-center justify-center">
          <AlyOrbIcon className="size-4" />
        </span>
        <div className="flex items-center gap-1 rounded-2xl bg-primary/10 px-3.5 py-3">
          {[0, 150, 300].map((delay) => (
            <span key={delay} className="size-1.5 animate-bounce rounded-full bg-primary/60 motion-reduce:animate-none" style={{ animationDelay: `${delay}ms` }} />
          ))}
        </div>
      </div>
    </div>
  );
}
