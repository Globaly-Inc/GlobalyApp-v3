"use client";

import { Bot, Check, Hand, User, UserRound } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { SIDEBAR_ROW, SIDEBAR_ROW_ACTIVE } from "@/components/chat/const";
import { listStamp } from "@/components/chat/utils";
import { cn } from "@/lib/utils";
import { VISITOR_STATUS_BADGE } from "@/app/business/ai-widget/const";
import { visitorDisplayName, visitorInitials } from "@/app/business/ai-widget/utils";
import type { WidgetVisitor } from "@/app/business/ai-widget/apis/types";
import { embedChatState, handlerLabel, type EmbedChatState } from "../utils";

/** The avatar's corner badge says who is answering, the way GlobalyOS's says which channel. */
const OWNER_BADGE: Record<EmbedChatState, { icon: typeof Bot; className: string; title: string }> = {
  ai: { icon: Bot, className: "bg-primary", title: "AI is handling" },
  waiting: { icon: UserRound, className: "bg-amber-500", title: "Wants a person" },
  human: { icon: Hand, className: "bg-cyan-600", title: "A team member is handling" },
  resolved: { icon: Check, className: "bg-emerald-600", title: "Resolved" },
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
          <OwnerIcon className="size-2.5 text-white" aria-hidden />
        </span>
      </span>

      <span className="min-w-0 flex-1 text-left">
        <span className="flex items-baseline gap-1.5">
          <span className={cn("truncate", !visitor.name && "italic text-muted-foreground")}>{visitorDisplayName(visitor)}</span>
          {visitor.status === "lead" && (
            <span className={cn("shrink-0 rounded px-1.5 text-[10px] font-medium", badge.className)}>{badge.label}</span>
          )}
          <span className="ml-auto shrink-0 text-[10px] font-normal text-muted-foreground">{listStamp(visitor.last_activity_at)}</span>
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
          <span className="truncate">
            {visitor.email ?? visitor.study_preference ?? `${visitor.message_count} message${visitor.message_count === 1 ? "" : "s"}`}
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-1">
            {state === "waiting" && (
              <span className="rounded bg-amber-500/15 px-1.5 text-[10px] font-medium text-amber-800">Wants a person</span>
            )}
            {state === "human" && (
              <span className="rounded bg-cyan-500/10 px-1.5 text-[10px] font-medium text-cyan-800">{handlerLabel(visitor)}</span>
            )}
            {state === "resolved" && (
              <span className="rounded bg-emerald-500/10 px-1.5 text-[10px] font-medium text-emerald-700">Resolved</span>
            )}
            {unread > 0 && (
              <Badge variant="destructive" className="h-5 min-w-5 px-1.5 text-[10px]">
                {unread > 99 ? "99+" : unread}
              </Badge>
            )}
          </span>
        </span>
      </span>
    </button>
  );
}
