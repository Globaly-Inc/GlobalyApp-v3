"use client";

import { User } from "lucide-react";
import { AlyOrbIcon } from "@/components/aly-orb-icon";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AttachmentList } from "@/components/chat/attachment-list";
import { RichTextMessage } from "@/components/chat/rich-text-message";
import { initials, messageTime } from "@/components/chat/utils";
import { MessageMarkdown } from "@/app/ai/components/message-markdown";
import { cn } from "@/lib/utils";
import type { VisitorMessage } from "@/app/business/ai-widget/apis/types";

/** A new sender block starts after this long, even from the same side. */
const GROUP_WINDOW_MS = 5 * 60_000;

/** Same side within five minutes — stacked under one name line, like a support inbox. */
export function isGroupedWith(message: VisitorMessage, previous: VisitorMessage | undefined): boolean {
  if (!previous || previous.role !== message.role || previous.sender_name !== message.sender_name) return false;
  return new Date(message.created_at).getTime() - new Date(previous.created_at).getTime() < GROUP_WINDOW_MS;
}

/** A centred outlined pill between days — no rule behind it. */
export function DatePill({ label }: Readonly<{ label: string }>) {
  return (
    <div className="my-4 flex justify-center">
      <span className="rounded-full border border-border bg-card px-3 py-0.5 text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

/**
 * One transcript message in a support-inbox layout: a `Name · time` line above the bubble and
 * the avatar at its bottom corner. The visitor sits left in grey. Both voices of the business sit
 * right: the AI assistant in a light tint of the brand navy, a staff member in a lighter sky tint
 * with a border and their initials — so a reader can tell at a glance when a person took over.
 * Tints, not the solid `--primary`: a long transcript in solid navy reads heavy.
 * A grouped message drops the name line and keeps an empty avatar gutter so bubbles align.
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
  const time = messageTime(message.created_at);
  const isBot = message.role === "assistant";
  const isAgent = message.role === "agent";
  const ourSide = isBot || isAgent;
  const agentName = message.sender_name ?? "Team member";

  return (
    <div className={cn("flex flex-col", ourSide ? "items-end" : "items-start", grouped ? "mt-1" : "mt-4")}>
      {!grouped && (
        <p className={cn("mb-1 text-xs text-muted-foreground", ourSide ? "mr-8" : "ml-8")}>
          {isBot ? (
            <>
              {time} · <span className="font-medium text-primary">AI Assistant</span>
            </>
          ) : isAgent ? (
            <>
              {time} · <span className="font-medium text-foreground">{agentName}</span> · Team
            </>
          ) : (
            <>
              <span className="font-medium text-foreground">{visitorName}</span> · {time}
            </>
          )}
        </p>
      )}

      <div className={cn("flex max-w-[80%] items-end gap-2", ourSide && "flex-row-reverse")}>
        <span className="size-6 shrink-0">
          {!grouped &&
            (isAgent ? (
              <Avatar className="size-6">
                <AvatarFallback className="bg-sky-100 text-[10px] font-medium text-sky-800">{initials(agentName)}</AvatarFallback>
              </Avatar>
            ) : isBot ? (
              // The orb draws past its box (scale-175), so it gets a smaller one than the slot.
              <span className="flex size-6 items-center justify-center">
                <AlyOrbIcon className="size-4" />
              </span>
            ) : (
              <Avatar className="size-6">
                <AvatarFallback className="bg-primary/10 text-[10px] font-medium text-primary">
                  {visitorInitials ?? <User className="size-3" aria-hidden />}
                </AvatarFallback>
              </Avatar>
            ))}
        </span>

        {isAgent ? (
          <div className="min-w-0 rounded-2xl border border-sky-200 bg-sky-50 px-3.5 py-2 text-sm leading-relaxed text-foreground">
            {message.content && <RichTextMessage body={message.content} />}
            {!!message.attachments?.length && (
              <div className={cn(message.content && "mt-2")}>
                <AttachmentList attachments={message.attachments} />
              </div>
            )}
          </div>
        ) : isBot ? (
          <div className="min-w-0 rounded-2xl bg-primary/10 px-3.5 py-2">
            <MessageMarkdown text={message.content} className="text-sm leading-relaxed" />
          </div>
        ) : (
          <div className="min-w-0 rounded-2xl bg-muted px-3.5 py-2 text-sm leading-relaxed text-foreground">
            <RichTextMessage body={message.content} />
          </div>
        )}
      </div>
    </div>
  );
}
