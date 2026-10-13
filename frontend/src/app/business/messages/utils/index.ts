import type { InboxChannel, WidgetVisitor } from "@/app/business/ai-widget/apis/types";
import type { InboxView } from "../const";

/**
 * Who a conversation is with right now — the one question every Inbox surface answers.
 *   ai         AI is answering
 *   waiting    the customer asked for a person; AI is paused until someone joins
 *   attention  AI flagged it for the team (unsure, sensitive, another app has it, a draft to review)
 *   human      a person is answering; AI is paused
 *   resolved   closed by the team
 */
export type EmbedChatState = "ai" | "waiting" | "attention" | "human" | "resolved";

/**
 * Mirrors the backend's takeover IDLE_MS. A person quiet this long, or a request nobody picked
 * up, hands the conversation back to AI (the 15-minute rule, kept on every channel).
 */
const IDLE_MS = 15 * 60_000;

const fresh = (at: string | null | undefined) => !!at && Date.now() - Date.parse(at) < IDLE_MS;

/** The WhatsApp Business phone app (coexistence) is a handler, with the sentinel user id 0. */
export const PHONE_APP_HANDLER_ID = 0;

export function embedChatState(
  v: Pick<WidgetVisitor, "handled_by_user_id" | "handled_at" | "resolved_at" | "handoff_requested_at" | "attention_reason">,
): EmbedChatState {
  if (v.resolved_at) return "resolved";
  // The server clears a lapsed takeover or request only when the customer next writes, so judge
  // their age here too. `!= null`, not truthiness: the phone-app handler's id is 0.
  if (v.handled_by_user_id != null && fresh(v.handled_at)) return "human";
  if (v.handled_by_user_id == null && fresh(v.handoff_requested_at)) return "waiting";
  if (v.attention_reason) return "attention";
  return "ai";
}

/** Needs Attention = asked for a person, or flagged by AI. */
export const needsAttention = (v: WidgetVisitor) => {
  const s = embedChatState(v);
  return s === "waiting" || s === "attention";
};

export const isPhoneApp = (v: Pick<WidgetVisitor, "handled_by_user_id">) => v.handled_by_user_id === PHONE_APP_HANDLER_ID;

/** "You" when it's the viewer's own conversation, the colleague's first name otherwise. */
export function handlerLabel(v: Pick<WidgetVisitor, "handled_by_me" | "handled_by_name" | "handled_by_user_id">): string {
  if (isPhoneApp(v)) return "Phone app";
  if (v.handled_by_me) return "You";
  return v.handled_by_name?.split(" ")[0] ?? "A teammate";
}

export const ATTENTION_LABEL: Record<NonNullable<WidgetVisitor["attention_reason"]>, string> = {
  ai_unsure: "AI needs attention",
  sensitive: "Sensitive question",
  other_app: "Answered in another app",
  suggest: "AI draft to review",
};

/** The header pill: "AI is handling", "You have this", "Manjil has this", "Resolved"… */
export function embedChatPill(v: WidgetVisitor): { label: string; className: string } {
  switch (embedChatState(v)) {
    case "resolved":
      return { label: "Resolved", className: "bg-success/15 text-success" };
    case "human":
      return {
        label: isPhoneApp(v) ? "Replying from the phone app" : v.handled_by_me ? "You have this" : `${handlerLabel(v)} has this`,
        className: "bg-info/15 text-info",
      };
    case "waiting":
      return { label: "Wants a person", className: "bg-warning/15 text-warning" };
    case "attention":
      return { label: ATTENTION_LABEL[v.attention_reason!], className: "bg-warning/15 text-warning" };
    default:
      return { label: "AI is handling", className: "bg-primary/10 text-primary" };
  }
}

/** A row's channel, defaulting to the website widget for rows from before 20261008_001. */
export const channelOf = (v: Pick<WidgetVisitor, "channel">): InboxChannel => v.channel ?? "ai_embed";

/** WhatsApp only: free-form replies within 24h of the customer's last message. */
export function whatsappWindowOpen(v: Pick<WidgetVisitor, "channel" | "last_inbound_at">): boolean {
  if (channelOf(v) !== "whatsapp") return true;
  return !!v.last_inbound_at && Date.now() - Date.parse(v.last_inbound_at) < 24 * 3_600_000;
}

/** Does this conversation belong in the Inbox sidebar's view? */
export function matchesView(v: WidgetVisitor, view: InboxView): boolean {
  if (view === "all") return true;
  if (view === "unread") return (v.unread_count ?? 0) > 0;
  if (view === "starred") return !!v.starred;
  // Needs Attention: the customer asked for a person, or AI flagged it.
  if (view === "attention") return needsAttention(v);
  return embedChatState(v) === view;
}

export const inChannel = (v: Pick<WidgetVisitor, "channel">, channel: InboxChannel | "all") => channel === "all" || channelOf(v) === channel;
