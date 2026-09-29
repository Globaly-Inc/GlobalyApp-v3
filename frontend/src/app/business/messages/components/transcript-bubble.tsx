"use client";

import { AlyOrbIcon } from "@/components/aly-orb-icon";
import { RichTextMessage } from "@/components/chat/rich-text-message";
import { messageTime } from "@/components/chat/utils";
import { MessageMarkdown } from "@/app/ai/components/message-markdown";
import type { VisitorMessage } from "@/app/business/ai-widget/apis/types";

/** `Sunday, September 13th`. */
export function dayLabel(iso: string): string {
  const date = new Date(iso);
  const day = date.getDate();
  const suffix = day % 10 === 1 && day !== 11 ? "st" : day % 10 === 2 && day !== 12 ? "nd" : day % 10 === 3 && day !== 13 ? "rd" : "th";
  const head = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long" }).format(date);
  return `${head} ${day}${suffix}`;
}

/** A full-width hairline with the day in an outlined pill across it. */
export function DateDivider({ label }: Readonly<{ label: string }>) {
  return (
    <div className="relative my-5 flex items-center justify-center">
      <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
      <span className="relative rounded-full border border-border bg-card px-3 py-0.5 text-xs font-semibold text-foreground">
        {label}
      </span>
    </div>
  );
}

/**
 * One transcript turn in Ask Aly's style (`@/app/ai/components/chat-message`), MIRRORED for the
 * business reading it: Ask Aly puts the person on the right because they are the one typing;
 * here the business is the reader and its assistant is "our side", so the visitor's grey bubble
 * sits left and the assistant's bubble-less prose sits right, with its mark beside it.
 *
 * The time goes where Ask Aly's copy/reply actions would — a read-only transcript has no
 * actions, and "when did they ask" is what an owner scanning it needs.
 */
export function TranscriptBubble({ message }: Readonly<{ message: VisitorMessage }>) {
  const time = messageTime(message.created_at);

  if (message.role === "assistant") {
    return (
      <div className="flex w-full flex-row-reverse gap-3 py-4">
        {/* Ask Aly's AssistantMark chip, carrying the Aly orb. The orb draws past its box
            (scale-175), so it gets a smaller box than the chip. */}
        <span className="mt-0.5 hidden size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 sm:flex">
          <AlyOrbIcon className="size-4" />
        </span>
        <div className="flex min-w-0 max-w-[85%] flex-col items-end gap-1.5">
          <div className="w-full">
            <MessageMarkdown text={message.content} />
          </div>
          <span className="text-[11px] text-muted-foreground">AI Assistant · {time}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1.5 py-4">
      <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-muted px-4 py-2.5 text-[0.9375rem] leading-relaxed text-foreground">
        <RichTextMessage body={message.content} />
      </div>
      <span className="text-[11px] text-muted-foreground">{time}</span>
    </div>
  );
}
