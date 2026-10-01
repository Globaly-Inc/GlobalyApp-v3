"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { dateSeparatorLabel } from "@/components/chat/utils";
import { visitorDisplayName, visitorInitials } from "@/app/business/ai-widget/utils";
import type { VisitorMessage, WidgetVisitor } from "@/app/business/ai-widget/apis/types";
import { DatePill, isGroupedWith, TranscriptBubble } from "./transcript-bubble";

/** Centred and narrower than the pane, so both sides' bubbles stay near each other. */
const MESSAGE_COLUMN = "mx-auto w-full max-w-2xl px-4 sm:px-6";

/** Within this of the bottom counts as "reading the latest", so new messages keep it pinned. */
const STICK_PX = 120;

/**
 * Where the business's voice changed hands, read off the transcript itself: the first reply
 * from a person after the AI (or after another person), and the first AI reply after a person.
 * There is no event log behind this — only the messages — so a takeover with no reply yet
 * shows in the header, not here.
 */
function handoverLines(messages: VisitorMessage[]): Map<number, string> {
  const lines = new Map<number, string>();
  let voice: string | null = null;
  for (const m of messages) {
    if (m.role === "user") continue;
    const next = m.role === "agent" ? `agent:${m.sender_name ?? ""}` : "ai";
    if (voice !== null && next !== voice) {
      lines.set(m.id, m.role === "agent" ? `${m.sender_name ?? "A team member"} joined the conversation` : "The AI assistant took over again");
    }
    voice = next;
  }
  return lines;
}

function HandoverLine({ label }: Readonly<{ label: string }>) {
  return (
    <div className="my-4 flex items-center gap-3 text-[11px] text-muted-foreground">
      <span className="h-px flex-1 bg-border" />
      {label}
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

export function EmbedTranscript({
  visitor,
  messages,
  failed,
}: Readonly<{ visitor: WidgetVisitor; messages: VisitorMessage[] | undefined; failed: boolean }>) {
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const lines = useMemo(() => handoverLines(messages ?? []), [messages]);
  const name = visitorDisplayName(visitor);
  const initials = visitor.name ? visitorInitials(visitor) : null;

  const shownFor = useRef<number | null>(null);
  // Before paint, so a poll that adds a message never shows a frame scrolled away from it.
  // A different chat always opens at its latest message, whatever the last one was scrolled to.
  useLayoutEffect(() => {
    if (shownFor.current !== visitor.id) {
      shownFor.current = visitor.id;
      pinned.current = true;
    }
    const el = scroller.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [messages, visitor.id]);

  const onScroll = () => {
    const el = scroller.current;
    if (el) pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_PX;
  };

  return (
    // The scroller spans the pane (scrollbar at its edge); the conversation is a centred column.
    <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto pb-6 pt-2">
      <div className={MESSAGE_COLUMN}>
        {!messages && !failed ? (
          <div className="space-y-4 px-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="size-9 shrink-0 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : !messages ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">Couldn&apos;t load this conversation.</p>
        ) : messages.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">No messages in this chat.</p>
        ) : (
          messages.map((m, i) => {
            const prev = messages[i - 1];
            const label = dateSeparatorLabel(m.created_at);
            const showDate = !prev || dateSeparatorLabel(prev.created_at) !== label;
            const handover = lines.get(m.id);
            return (
              <div key={m.id}>
                {showDate && <DatePill label={label} />}
                {handover && <HandoverLine label={handover} />}
                <TranscriptBubble
                  message={m}
                  grouped={!showDate && !handover && isGroupedWith(m, prev)}
                  visitorName={name}
                  visitorInitials={initials}
                />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
