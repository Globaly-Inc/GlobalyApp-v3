"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, Bot, ExternalLink, Info, User } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { VISITOR_STATUS_BADGE } from "@/app/business/ai-widget/const";
import { visitorDisplayName, visitorInitials } from "@/app/business/ai-widget/utils";
import type { WidgetVisitor } from "@/app/business/ai-widget/apis/types";
import { fetchEmbedTranscript } from "../store/embed-chats-slice";
import { DateDivider, dayLabel, isGroupedWith, TranscriptBubble } from "./transcript-bubble";

/**
 * An AI conversation (embed widget chat): the enquiry `ConversationView` header bar over a
 * bubble transcript (visitor left, assistant right), read-only: the visitor talked to the assistant on
 * the business's website, and there is no channel to reply to them from here. The footer says
 * so where the composer would be, and points to the visitor's record for follow-up.
 */
/**
 * The message column: up to 56rem wide, and NOT centred — the left gap takes 30% of the spare
 * width and the right 70%, so the conversation leans toward the list. `100%` in a margin is the
 * scroller's width; on a narrow pane the spare width goes negative and the max() floors it.
 */
const MESSAGE_COLUMN = "w-full max-w-4xl ml-[max(0rem,calc((100%-56rem)*0.3))]";

export function EmbedConversationView({ visitor, onBack }: Readonly<{ visitor: WidgetVisitor; onBack: () => void }>) {
  const dispatch = useAppDispatch();
  const messages = useAppSelector((s) => s.embedChats.transcripts[visitor.id]);
  const status = useAppSelector((s) => s.embedChats.transcriptStatus[visitor.id]);

  // Strict Mode double-invokes effects; only refetch when the open chat actually changes.
  const fetchedFor = useRef<number | null>(null);
  useEffect(() => {
    if (fetchedFor.current === visitor.id) return;
    fetchedFor.current = visitor.id;
    dispatch(fetchEmbedTranscript(visitor.id));
  }, [dispatch, visitor.id]);

  const badge = VISITOR_STATUS_BADGE[visitor.status];
  const name = visitorDisplayName(visitor);

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-3 py-2.5 md:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2 md:gap-3">
          <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={onBack} aria-label="Back to conversations">
            <ArrowLeft />
          </Button>
          <Avatar className="size-9 shrink-0">
            <AvatarFallback className="bg-primary/10 text-xs text-primary">
              {visitor.name ? visitorInitials(visitor) : <User className="size-4" aria-hidden />}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 className={cn("truncate text-base font-semibold text-foreground", !visitor.name && "italic")}>{name}</h2>
              <span className={cn("inline-flex shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium", badge.className)}>
                {badge.label}
              </span>
            </div>
            <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
              <Bot className="size-3 shrink-0" aria-hidden />
              AI conversation{visitor.email ? ` · ${visitor.email}` : ""}
            </p>
          </div>
        </div>
        <Link
          href={`/business/ai-widget/visitors/${visitor.id}`}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "shrink-0 gap-1.5")}
        >
          <ExternalLink className="size-3.5" aria-hidden />
          <span className="hidden sm:inline">View visitor</span>
        </Link>
      </div>

      {/* The scroller spans the pane (scrollbar at its edge). Messages sit in a column shifted
          toward the list; day dividers are wider, 80% of the pane, centred. */}
      <div className="min-h-0 flex-1 overflow-y-auto pb-4 pt-1">
        <div className={MESSAGE_COLUMN}>
        {!messages && status !== "failed" ? (
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
        ) : status === "failed" && !messages ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">Couldn&apos;t load this conversation.</p>
        ) : messages!.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">No messages in this chat.</p>
        ) : null}
        </div>
        {messages && messages.length > 0 &&
          messages.map((m, i) => {
            const prev = messages[i - 1];
            const label = dayLabel(m.created_at);
            const showDate = !prev || dayLabel(prev.created_at) !== label;
            return (
              <div key={m.id}>
                {showDate && (
                  <div className="mx-auto w-4/5">
                    <DateDivider label={label} />
                  </div>
                )}
                <div className={MESSAGE_COLUMN}>
                  <TranscriptBubble
                    message={m}
                    grouped={!showDate && isGroupedWith(m, prev)}
                    visitorName={name}
                    visitorInitials={visitor.name ? visitorInitials(visitor) : null}
                  />
                </div>
              </div>
            );
          })}
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
        <Info className="size-3.5 shrink-0" aria-hidden />
        This visitor chatted with your AI assistant. The transcript is read-only.
      </div>
    </div>
  );
}
