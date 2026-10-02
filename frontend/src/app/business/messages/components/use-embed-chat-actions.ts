"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useAppDispatch } from "@/lib/hooks";
import { resolveEmbedChat, setEmbedHandoff } from "../store/embed-chats-slice";

type Action = "takeOver" | "handBack" | "resolve" | "reopen";

const FAILED: Record<Action, string> = {
  takeOver: "Couldn't take over this chat",
  handBack: "Couldn't hand this chat back to the AI",
  resolve: "Couldn't resolve this chat",
  reopen: "Couldn't reopen this chat",
};

/**
 * The header and the visitor panel both carry these buttons. The conversation view calls this
 * once and hands the result to both, so `pending` disables every copy while a call is in flight
 * and a double click can't race itself.
 */
export type EmbedChatActions = ReturnType<typeof useEmbedChatActions>;

export function useEmbedChatActions(visitorId: number) {
  const dispatch = useAppDispatch();
  const [pending, setPending] = useState<Action | null>(null);

  const run = async (action: Action) => {
    setPending(action);
    const result =
      action === "takeOver" || action === "handBack"
        ? await dispatch(setEmbedHandoff({ visitorId, mode: action === "takeOver" ? "human" : "ai" }))
        : await dispatch(resolveEmbedChat({ visitorId, resolved: action === "resolve" }));
    setPending(null);
    if ("error" in result) toast.error(FAILED[action], { description: result.error.message ?? "Please try again." });
  };

  return {
    pending,
    takeOver: () => run("takeOver"),
    handBack: () => run("handBack"),
    resolve: () => run("resolve"),
    reopen: () => run("reopen"),
  };
}
