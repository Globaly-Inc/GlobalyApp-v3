"use client";

import { Bot, CheckCircle2, Hand, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { WidgetVisitor } from "@/app/business/ai-widget/apis/types";
import { embedChatState, handlerLabel } from "../utils";
import type { EmbedChatActions } from "./use-embed-chat-actions";

/**
 * Take over / Resume AI / Resolve / Reopen for one widget chat, in the header (a row) and the
 * visitor panel (a full-width stack). A colleague's chat can still be taken over — they may have
 * gone home — but the button names them, so nobody does it by accident.
 */
export function EmbedChatControls({
  visitor,
  actions,
  stacked = false,
}: Readonly<{ visitor: WidgetVisitor; actions: EmbedChatActions; stacked?: boolean }>) {
  const state = embedChatState(visitor);
  const busy = actions.pending !== null;
  const spin = (action: EmbedChatActions["pending"]) =>
    actions.pending === action ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null;
  const size = stacked ? "default" : "sm";
  const wide = stacked && "w-full";

  if (state === "resolved") {
    return (
      <Button variant="outline" size={size} className={cn(wide)} disabled={busy} onClick={actions.reopen}>
        {spin("reopen") ?? <RotateCcw className="size-3.5" aria-hidden />}
        Reopen
      </Button>
    );
  }

  const mine = state === "human" && visitor.handled_by_me;
  return (
    <div className={cn("flex gap-1.5", stacked && "flex-col")}>
      {mine ? (
        <Button variant="outline" size={size} className={cn(wide)} disabled={busy} onClick={actions.handBack}>
          {spin("handBack") ?? <Bot className="size-3.5" aria-hidden />}
          Resume AI
        </Button>
      ) : (
        <Button size={size} className={cn(wide)} disabled={busy} onClick={actions.takeOver}>
          {spin("takeOver") ?? <Hand className="size-3.5" aria-hidden />}
          {state === "human" ? `Take over from ${handlerLabel(visitor)}` : "Take over"}
        </Button>
      )}
      {state === "human" && !mine && stacked && (
        <Button variant="outline" size={size} className={cn(wide)} disabled={busy} onClick={actions.handBack}>
          {spin("handBack") ?? <Bot className="size-3.5" aria-hidden />}
          Resume AI
        </Button>
      )}
      <Button variant="outline" size={size} className={cn(wide)} disabled={busy} onClick={actions.resolve}>
        {spin("resolve") ?? <CheckCircle2 className="size-3.5" aria-hidden />}
        Resolve
      </Button>
    </div>
  );
}
