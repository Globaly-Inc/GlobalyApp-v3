"use client";

import { User } from "lucide-react";
import { AlyOrbIcon } from "@/components/aly-orb-icon";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { RichTextMessage } from "@/components/chat/rich-text-message";
import { messageTime } from "@/components/chat/utils";
import { MessageMarkdown } from "@/app/ai/components/message-markdown";
import { cn } from "@/lib/utils";
import type { VisitorMessage } from "@/app/business/ai-widget/apis/types";

/** A new sender block starts after this long, even from the same side. */
const GROUP_WINDOW_MS = 5 * 60_000;

/** Same side, same day, within five minutes — stacked under one header, as support widgets do. */
export function isGroupedWith(message: VisitorMessage, previous: VisitorMessage | undefined): boolean {
  if (!previous || previous.role !== message.role) return false;
  return new Date(message.created_at).getTime() - new Date(previous.created_at).getTime() < GROUP_WINDOW_MS;
}

/** `Sunday, September 13th`. */
export function dayLabel(iso: string): string {
  const date = new Date(iso);
  const day = date.getDate();
  const suffix = day % 10 === 1 && day !== 11 ? "st" : day % 10 === 2 && day !== 12 ? "nd" : day % 10 === 3 && day !== 13 ? "rd" : "th";
  const head = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long" }).format(date);
  return `${head} ${day}${suffix}`;
}

/** `Sep 13, 1:01 PM` — the stamp beside each sender name. */
const headerStamp = (iso: string) =>
  `${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(iso))}, ${messageTime(iso)}`;

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
 * One transcript message, Gleap-style: the visitor on the left in grey, the business's AI
 * assistant on the right in a light blue. The first message of a block carries the avatar,
 * name and time; the rest of the block stacks as bare bubbles beneath it.
 *
 * Deliberately NOT the navy primary for the assistant's bubbles — a solid brand fill makes a
 * long transcript read heavy. Light tints keep dark text on both sides.
 */
export function TranscriptBubble({
  message,
  grouped,
  visitorName,
  visitorInitials,
}: Readonly<{
  message: VisitorMessage;
  grouped: boolean;
  visitorName: string;
  /** Null for an anonymous visitor — a person glyph instead. */
  visitorInitials: string | null;
}>) {
  const isBot = message.role === "assistant";
  const stamp = headerStamp(message.created_at);

  if (isBot) {
    return (
      <div className={cn("flex flex-col items-end pl-2 pr-4 md:pr-6", grouped ? "pt-1.5" : "pt-4")}>
        {!grouped && (
          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{stamp}</span>
            <span className="text-sm font-semibold text-foreground">AI Assistant</span>
            {/* Aly's orb draws past its box (scale-175), so it gets a smaller box in the avatar slot. */}
            <span className="flex size-7 items-center justify-center">
              <AlyOrbIcon className="size-5" />
            </span>
          </div>
        )}
        <div className="mr-9 max-w-[80%] rounded-2xl rounded-tr-md bg-blue-100/70 px-3.5 py-2.5 dark:bg-blue-500/15 md:max-w-[70%]">
          <MessageMarkdown text={message.content} className="text-sm leading-relaxed" />
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col items-start pl-2 pr-4 md:pr-6", grouped ? "pt-1.5" : "pt-4")}>
      {!grouped && (
        <div className="mb-1.5 flex items-center gap-2">
          <Avatar className="size-7">
            <AvatarFallback
              className={cn("text-[10px] font-semibold", visitorInitials ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground")}
            >
              {visitorInitials ?? <User className="size-3.5" aria-hidden />}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm font-semibold text-foreground">{visitorName}</span>
          <span className="text-xs text-muted-foreground">{stamp}</span>
        </div>
      )}
      <div className="ml-9 max-w-[80%] rounded-2xl rounded-tl-md bg-muted px-3.5 py-2.5 text-sm leading-relaxed text-foreground md:max-w-[70%]">
        <RichTextMessage body={message.content} />
      </div>
    </div>
  );
}
