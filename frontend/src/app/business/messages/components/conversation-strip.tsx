"use client";

import { Bot, CheckCircle2, Clock, Hand, Smartphone, TriangleAlert, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { visitorDisplayName } from "@/app/business/ai-widget/utils";
import type { WidgetVisitor } from "@/app/business/ai-widget/apis/types";
import { INBOX_CHANNELS } from "../const";
import { channelOf, embedChatState, handlerLabel, isPhoneApp, whatsappWindowOpen } from "../utils";
import type { EmbedChatActions } from "./use-embed-chat-actions";

const TONE = {
  ai: "bg-primary/5 text-primary",
  attention: "bg-amber-500/15 text-amber-900",
  human: "bg-cyan-500/10 text-cyan-900",
  resolved: "bg-emerald-500/10 text-emerald-800",
} as const;

/**
 * Under the header: who is answering, in one sentence, with the one action that matters. Makes
 * AI mode and human mode impossible to confuse. On WhatsApp, also the 24-hour window.
 */
export function ConversationStrip({ visitor, actions }: Readonly<{ visitor: WidgetVisitor; actions: EmbedChatActions }>) {
  const state = embedChatState(visitor);
  const name = visitorDisplayName(visitor).split(" ")[0];
  const channel = INBOX_CHANNELS[channelOf(visitor)].label;
  const busy = actions.pending !== null;
  const takeOver = (label = "Take over") => actions.canTakeOver && (
    <Button size="sm" disabled={busy} onClick={actions.takeOver}><Hand className="size-3.5" aria-hidden />{label}</Button>
  );
  const resume = <Button size="sm" variant="outline" disabled={busy} onClick={actions.handBack}><Bot className="size-3.5" aria-hidden />Resume AI</Button>;

  let tone: keyof typeof TONE = "ai";
  let Icon = Bot;
  let title = "AI is handling this conversation";
  let body = `Replies go out automatically on ${channel}. It moves to Needs Attention if a person is needed.`;
  let action: React.ReactNode = takeOver();

  if (state === "resolved") {
    [tone, Icon, title, body, action] = ["resolved", CheckCircle2, "Resolved", `If ${name} writes again, AI picks the conversation back up.`, null];
  } else if (state === "human" && isPhoneApp(visitor)) {
    [tone, Icon, title, body] = ["human", Smartphone, "Your team is replying from the WhatsApp Business app", "AI is paused so it doesn't talk over them. Their replies show here."];
    action = <>{takeOver("Take over here")}{resume}</>;
  } else if (state === "human" && visitor.handled_by_me) {
    [tone, Icon, title, body, action] = ["human", UserRound, "You are handling this conversation", "AI has been paused. If you don't reply for 15 minutes, AI takes back over.", resume];
  } else if (state === "human") {
    [tone, Icon, title, body, action] = ["human", UserRound, `${handlerLabel(visitor)} is handling this conversation`, "AI is paused.", takeOver(`Take over from ${handlerLabel(visitor)}`)];
  } else if (state === "waiting") {
    [tone, Icon, title, body] = ["attention", TriangleAlert, `${name} asked to talk to a person`, "AI paused and told them someone will reply."];
  } else if (state === "attention") {
    tone = "attention";
    Icon = TriangleAlert;
    const copy = ({
      ai_unsure: ["AI needs assistance", "AI passed on a question only your team can answer."],
      sensitive: ["Sensitive question", "AI gave a holding reply and flagged this for your team."],
      other_app: ["Another app is answering this conversation", "Facebook Page Inbox or Meta's Business Agent has the thread. AI won't reply here until you take it back."],
      suggest: ["AI drafted a reply", `Suggest-only mode is on for ${channel}. Take over to review and send it.`],
    } as const)[visitor.attention_reason!];
    [title, body] = copy;
    if (visitor.attention_reason === "suggest") action = takeOver("Review draft");
  }

  const whatsapp = channelOf(visitor) === "whatsapp" && state !== "resolved";
  const windowOpen = whatsappWindowOpen(visitor);

  return (
    <div className="shrink-0 border-b border-border">
      <div className={cn("flex flex-wrap items-center gap-3 px-4 py-2.5", TONE[tone])}>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-card"><Icon className="size-4" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs opacity-85">{body}</p>
        </div>
        {action && <div className="flex shrink-0 gap-1.5">{action}</div>}
      </div>
      {whatsapp && (
        <p className={cn("flex items-center gap-2 px-4 py-1.5 text-xs", windowOpen ? "bg-emerald-500/5 text-emerald-800" : "bg-amber-50 text-amber-900")}>
          {windowOpen ? <CheckCircle2 className="size-3.5" aria-hidden /> : <Clock className="size-3.5" aria-hidden />}
          {windowOpen
            ? "Customer service window open: free-form replies can be sent."
            : `Customer service window closed. Only an approved template can be sent until ${name} writes again.`}
        </p>
      )}
    </div>
  );
}
