"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import type { WidgetVisitor } from "@/app/business/ai-widget/apis/types";
import { resolveEmbedChat, setEmbedHandoff, starEmbedChat } from "../store/embed-chats-slice";

type Action = "takeOver" | "handBack" | "resolve" | "reopen";
/** The two that change who answers the customer are confirmed first. */
export type ConfirmAction = Extract<Action, "takeOver" | "handBack">;

const FAILED: Record<Action, string> = {
  takeOver: "Couldn't take over this conversation",
  handBack: "Couldn't hand this conversation back to AI",
  resolve: "Couldn't resolve this conversation",
  reopen: "Couldn't reopen this conversation",
};

/**
 * The header, the state strip, the composer and the visitor panel all carry these buttons. The
 * conversation view calls this once and hands the result to every copy, so `pending` disables all
 * of them while a call is in flight and a double click can't race itself.
 *
 * takeOver / handBack open a confirmation (`confirming`); the dialog's button calls `confirm`.
 */
export type EmbedChatActions = ReturnType<typeof useEmbedChatActions>;

export function useEmbedChatActions(visitor: Pick<WidgetVisitor, "id" | "channel" | "channel_connection_id">) {
  const dispatch = useAppDispatch();
  const visitorId = visitor.id;
  // A channel's AI settings can turn human takeover off; the widget always allows it. The server
  // enforces it too — this only keeps buttons that would be refused off the screen.
  const canTakeOver = useAppSelector((s) =>
    s.inboxChannels.connections.find((c) => c.id === visitor.channel_connection_id)?.ai_config?.takeover !== false);
  const [pending, setPending] = useState<Action | null>(null);
  const [confirming, setConfirming] = useState<ConfirmAction | null>(null);

  const run = async (action: Action) => {
    setPending(action);
    const result =
      action === "takeOver" || action === "handBack"
        ? await dispatch(setEmbedHandoff({ visitorId, mode: action === "takeOver" ? "human" : "ai" }))
        : await dispatch(resolveEmbedChat({ visitorId, resolved: action === "resolve" }));
    setPending(null);
    setConfirming(null);
    if ("error" in result) toast.error(FAILED[action], { description: result.error.message ?? "Please try again." });
  };

  return {
    pending,
    confirming,
    canTakeOver,
    takeOver: () => setConfirming("takeOver"),
    handBack: () => setConfirming("handBack"),
    confirm: () => (confirming ? run(confirming) : undefined),
    cancel: () => setConfirming(null),
    resolve: () => run("resolve"),
    reopen: () => run("reopen"),
    toggleStar: (starred: boolean) => dispatch(starEmbedChat({ visitorId, starred })),
  };
}
