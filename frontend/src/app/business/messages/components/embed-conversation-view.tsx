"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, Bot, ExternalLink, Info, User } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { dateSeparatorLabel, messageTime } from "@/components/chat/utils";
import { MessageMarkdown } from "@/app/ai/components/message-markdown";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { VISITOR_STATUS_BADGE } from "@/app/business/ai-widget/const";
import { visitorDisplayName, visitorInitials } from "@/app/business/ai-widget/utils";
import type { VisitorMessage, WidgetVisitor } from "@/app/business/ai-widget/apis/types";
import { fetchEmbedTranscript } from "../store/embed-chats-slice";

/**
 * An AI conversation (embed widget chat), laid out like the enquiry `ConversationView` — header bar, V2-style
 * bubble-less rows, date separators — but read-only: the visitor talked to the assistant on
 * the business's website, and there is no channel to reply to them from here. The footer says
 * so where the composer would be, and points to the visitor's record for follow-up.
 */
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

      <div className="min-h-0 flex-1 overflow-y-auto py-3">
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
        ) : (
          messages!.map((m, i) => {
            const prev = messages![i - 1];
            const label = dateSeparatorLabel(m.created_at);
            const showDate = !prev || dateSeparatorLabel(prev.created_at) !== label;
            return (
              <div key={m.id}>
                {showDate && (
                  <div className="my-4 flex items-center gap-3 px-4">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-xs font-medium text-muted-foreground">{label}</span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                )}
                <TranscriptRow message={m} visitorName={name} grouped={!showDate && prev?.role === m.role} />
              </div>
            );
          })
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
        <Info className="size-3.5 shrink-0" aria-hidden />
        This visitor chatted with your AI assistant. The transcript is read-only.
      </div>
    </div>
  );
}

/** `MessageRow`'s avatar gutter + name/time header, without its actions (nothing here is writable). */
function TranscriptRow({
  message,
  visitorName,
  grouped,
}: Readonly<{ message: VisitorMessage; visitorName: string; grouped: boolean }>) {
  const isBot = message.role === "assistant";
  return (
    <div className={cn("flex gap-1.5 px-1.5 py-0.5 hover:bg-muted/40 md:gap-3 md:px-4", !grouped && "md:py-1")}>
      <div className="w-7 shrink-0 md:w-9">
        {!grouped && (
          <Avatar className="size-7 md:size-9">
            <AvatarFallback className={cn("text-[10px] md:text-xs", isBot ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary")}>
              {isBot ? <Bot className="size-4" aria-hidden /> : <User className="size-4" aria-hidden />}
            </AvatarFallback>
          </Avatar>
        )}
      </div>
      <div className="min-w-0 flex-1">
        {!grouped && (
          <div className="mb-0.5 flex items-center gap-2">
            <span className={cn("text-sm font-semibold", isBot ? "text-primary" : "text-foreground")}>
              {isBot ? "AI Assistant" : visitorName}
            </span>
            <span className="text-xs text-muted-foreground">{messageTime(message.created_at)}</span>
          </div>
        )}
        {isBot ? (
          <MessageMarkdown text={message.content} className="text-sm leading-relaxed" />
        ) : (
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">{message.content}</p>
        )}
      </div>
    </div>
  );
}
