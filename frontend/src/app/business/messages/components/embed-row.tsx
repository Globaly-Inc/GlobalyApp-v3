"use client";

import { Bot, Check, Hand, Star, TriangleAlert, User, UserRound } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { SIDEBAR_ROW, SIDEBAR_ROW_ACTIVE } from "@/components/chat/const";
import { listStamp } from "@/components/chat/utils";
import { cn } from "@/lib/utils";
import { VISITOR_STATUS_BADGE } from "@/app/business/ai-widget/const";
import { visitorDisplayName, visitorInitials } from "@/app/business/ai-widget/utils";
import type { WidgetVisitor } from "@/app/business/ai-widget/apis/types";
import { ATTENTION_LABEL, channelOf, embedChatState, handlerLabel, type EmbedChatState } from "../utils";
import { ChannelGlyph } from "./channel-glyph";

/** The avatar's corner badge says who is answering, the way GlobalyOS's says which channel. */
const OWNER_BADGE: Record<EmbedChatState, { icon: typeof Bot; className: string; title: string }> = {
  ai: { icon: Bot, className: "bg-primary text-primary-foreground", title: "AI is handling" },
  waiting: { icon: UserRound, className: "bg-warning text-warning-foreground", title: "Wants a person" },
  attention: { icon: TriangleAlert, className: "bg-warning text-warning-foreground", title: "Needs attention" },
  human: { icon: Hand, className: "bg-info text-info-foreground", title: "A team member is handling" },
  resolved: { icon: Check, className: "bg-success text-success-foreground", title: "Resolved" },
};

/** `ConversationRow`'s layout for a widget chat: owner badge, unread count, and who has it. */
export function EmbedRow({ visitor, isActive, onOpen }: Readonly<{ visitor: WidgetVisitor; isActive: boolean; onOpen: () => void }>) {
  const badge = VISITOR_STATUS_BADGE[visitor.status];
  const state = embedChatState(visitor);
  const owner = OWNER_BADGE[state];
  const OwnerIcon = owner.icon;
  const unread = visitor.unread_count ?? 0;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        SIDEBAR_ROW,
        "cursor-pointer items-start",
        isActive ? SIDEBAR_ROW_ACTIVE : "hover:bg-muted/60",
        // Waiting for a person: an amber edge, so the queue reads at a glance.
        !isActive && (state === "waiting" || state === "attention") && "border-l-2 border-warning",
        unread > 0 && "font-semibold",
      )}
    >
      <span className="relative shrink-0">
        <Avatar className="size-8">
          <AvatarFallback className="bg-muted text-xs text-muted-foreground">
            {visitor.name ? visitorInitials(visitor) : <User className="size-4" aria-hidden />}
          </AvatarFallback>
        </Avatar>
        <span
          className={cn("absolute -bottom-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full ring-2 ring-card", owner.className)}
          title={owner.title}
        >
          <OwnerIcon className="size-2.5" aria-hidden />
        </span>
      </span>

      <span className="min-w-0 flex-1 text-left">
        <span className="flex items-baseline gap-1.5">
          <span className={cn("truncate", !visitor.name && "italic text-muted-foreground")}>{visitorDisplayName(visitor)}</span>
          {visitor.status === "lead" && (
            <span className={cn("shrink-0 rounded px-1.5 text-xs font-medium", badge.className)}>{badge.label}</span>
          )}
          <span className="ml-auto shrink-0 text-xs font-normal text-muted-foreground">{listStamp(visitor.last_activity_at)}</span>
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
          <ChannelGlyph channel={channelOf(visitor)} size="xs" />
          <span className="truncate">
            {visitor.email ?? visitor.channel_handle ?? visitor.study_preference ?? `${visitor.message_count} message${visitor.message_count === 1 ? "" : "s"}`}
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-1">
            {visitor.starred && <Star className="size-3 fill-rating text-rating" aria-label="Starred" />}
            {state === "waiting" && (
              <Badge variant="warning" className="h-4 px-1.5">Wants a person</Badge>
            )}
            {state === "attention" && visitor.attention_reason && (
              <span className="rounded bg-warning/15 px-1.5 text-xs font-medium text-warning">{ATTENTION_LABEL[visitor.attention_reason]}</span>
            )}
            {state === "human" && (
              <Badge variant="info" className="h-4 px-1.5">{handlerLabel(visitor)}</Badge>
            )}
            {state === "resolved" && (
              <Badge variant="success" className="h-4 px-1.5">Resolved</Badge>
            )}
            {unread > 0 && (
              <Badge variant="destructive" className="h-5 min-w-5 px-1.5">
                {unread > 99 ? "99+" : unread}
              </Badge>
            )}
          </span>
        </span>
      </span>
    </button>
  );
}
