import type { WidgetVisitor } from "@/app/business/ai-widget/apis/types";

/** Who a widget chat is with right now — the one question every AI Conversations surface answers. */
export type EmbedChatState = "ai" | "human" | "resolved";

export function embedChatState(v: Pick<WidgetVisitor, "handled_by_user_id" | "resolved_at">): EmbedChatState {
  if (v.resolved_at) return "resolved";
  return v.handled_by_user_id ? "human" : "ai";
}

/** "You" when it's the viewer's own chat, the colleague's first name otherwise. */
export function handlerLabel(v: Pick<WidgetVisitor, "handled_by_me" | "handled_by_name">): string {
  if (v.handled_by_me) return "You";
  return v.handled_by_name?.split(" ")[0] ?? "A teammate";
}

/** The header pill: "AI is handling", "You have this", "Manjil has this", "Resolved". */
export function embedChatPill(v: WidgetVisitor): { label: string; className: string } {
  switch (embedChatState(v)) {
    case "resolved":
      return { label: "Resolved", className: "bg-emerald-500/10 text-emerald-700" };
    case "human":
      return {
        label: v.handled_by_me ? "You have this" : `${handlerLabel(v)} has this`,
        className: "bg-cyan-500/10 text-cyan-800",
      };
    default:
      return { label: "AI is handling", className: "bg-primary/10 text-primary" };
  }
}
