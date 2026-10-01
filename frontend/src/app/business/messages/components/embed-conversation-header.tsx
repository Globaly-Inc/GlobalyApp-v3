"use client";

import Link from "next/link";
import { ArrowLeft, ExternalLink, MessageSquare, User } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { VISITOR_STATUS_BADGE } from "@/app/business/ai-widget/const";
import { visitorDisplayName, visitorInitials } from "@/app/business/ai-widget/utils";
import type { WidgetVisitor } from "@/app/business/ai-widget/apis/types";
import { embedChatPill } from "../utils";
import { EmbedChatControls } from "./embed-chat-controls";
import type { EmbedChatActions } from "./use-embed-chat-actions";

/**
 * The visitor, the channel, who is answering, and the takeover controls. The controls hide
 * at lg, where the visitor panel carries the same buttons and there is room for only one set.
 */
export function EmbedConversationHeader({
  visitor,
  actions,
  onBack,
}: Readonly<{ visitor: WidgetVisitor; actions: EmbedChatActions; onBack: () => void }>) {
  const badge = VISITOR_STATUS_BADGE[visitor.status];
  const pill = embedChatPill(visitor);

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-3 py-2.5 md:px-4">
      <div className="flex min-w-0 flex-1 items-center gap-2 md:gap-3">
        <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={onBack} aria-label="Back to conversations">
          <ArrowLeft />
        </Button>
        <span className="relative shrink-0">
          <Avatar className="size-9">
            <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
              {visitor.name ? visitorInitials(visitor) : <User className="size-4" aria-hidden />}
            </AvatarFallback>
          </Avatar>
          {/* The channel badge: this came in through the website widget. */}
          <span className="absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded bg-card">
            <MessageSquare className="size-3 text-primary" aria-hidden />
          </span>
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h2 className={cn("truncate text-base font-semibold text-foreground", !visitor.name && "italic")}>
              {visitorDisplayName(visitor)}
            </h2>
            <span className={cn("inline-flex shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium", badge.className)}>
              {badge.label}
            </span>
          </div>
          <p className="truncate text-xs text-muted-foreground">via Web widget{visitor.email ? ` · ${visitor.email}` : ""}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", pill.className)}>{pill.label}</span>
        <div className="lg:hidden">
          <EmbedChatControls visitor={visitor} actions={actions} />
        </div>
        <Link
          href={`/business/ai-widget/visitors/${visitor.id}`}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1.5")}
        >
          <ExternalLink className="size-3.5" aria-hidden />
          <span className="hidden sm:inline">View visitor</span>
        </Link>
      </div>
    </div>
  );
}
