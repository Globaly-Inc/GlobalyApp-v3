import type { WidgetVisitor } from "@/app/business/ai-widget/apis/types";

/** Who a widget chat is with right now — the one question every AI Conversations surface answers. */
export type EmbedChatState = "ai" | "waiting" | "human" | "resolved";

/**
 * Mirrors the backend's takeover IDLE_MS. A staff member quiet this long, or a request nobody
 * picked up, hands the chat back to the AI.
 */
const IDLE_MS = 15 * 60_000;

const fresh = (at: string | null | undefined) => !!at && Date.now() - Date.parse(at) < IDLE_MS;

export function embedChatState(
  v: Pick<WidgetVisitor, "handled_by_user_id" | "handled_at" | "resolved_at" | "handoff_requested_at">,
): EmbedChatState {
  if (v.resolved_at) return "resolved";
  // The server clears a lapsed takeover or request only when the visitor next writes, so judge
  // their age here too. Otherwise a chat someone took over this morning still reads "Alex has
  // this", although the AI answers the visitor's next message.
  if (v.handled_by_user_id && fresh(v.handled_at)) return "human";
  if (!v.handled_by_user_id && fresh(v.handoff_requested_at)) return "waiting";
  return "ai";
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
    case "waiting":
      return { label: "Wants a person", className: "bg-amber-500/15 text-amber-800" };
    default:
      return { label: "AI is handling", className: "bg-primary/10 text-primary" };
  }
}
