"use client";

import { Bot, CheckCircle2, Hand } from "lucide-react";
import { toast } from "sonner";
import { MessageComposer } from "@/components/chat/message-composer";
import { useAppDispatch } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { aiWidgetApi } from "@/app/business/ai-widget/apis";
import { visitorDisplayName } from "@/app/business/ai-widget/utils";
import type { WidgetVisitor } from "@/app/business/ai-widget/apis/types";
import { sendEmbedMessage } from "../store/embed-chats-slice";
import { embedChatState, handlerLabel } from "../utils";

/** What sending will do, said before it happens — a reply here is never "just a message". */
function banner(visitor: WidgetVisitor): { icon: typeof Bot; text: string; className: string } {
  switch (embedChatState(visitor)) {
    case "resolved":
      return { icon: CheckCircle2, text: "This chat is resolved. Replying reopens it and puts you in charge.", className: "bg-emerald-500/10 text-emerald-800" };
    case "human":
      return visitor.handled_by_me
        ? { icon: Hand, text: "You're handling this chat, so the AI is paused. It takes over again 15 minutes after your last reply.", className: "bg-cyan-500/10 text-cyan-900" }
        : { icon: Hand, text: `${handlerLabel(visitor)} is handling this chat. Your reply is sent, and they stay in charge.`, className: "bg-cyan-500/10 text-cyan-900" };
    default:
      return { icon: Bot, text: "The AI assistant is answering this visitor. Sending a reply takes the chat over.", className: "bg-amber-500/10 text-amber-900" };
  }
}

/**
 * The enquiry composer (emoji, attachments, formatting), sending as a staff reply. No saved
 * drafts: the Drafts shortcut lists enquiry threads only, so a widget-chat draft there would
 * be a row that opens nothing.
 */
export function EmbedChatComposer({ visitor }: Readonly<{ visitor: WidgetVisitor }>) {
  const dispatch = useAppDispatch();
  const note = banner(visitor);
  const Icon = note.icon;

  const handleSend = async (body: string, attachments: string[]) => {
    const result = await dispatch(sendEmbedMessage({ visitorId: visitor.id, body, attachments }));
    if ("error" in result) {
      toast.error("Couldn't send your reply", { description: result.error.message ?? "Please try again." });
      return false;
    }
    return true;
  };

  return (
    <div className="shrink-0 border-t border-border">
      <p className={cn("mx-3 mt-3 flex items-center gap-2 rounded-md px-3 py-1.5 text-xs", note.className)}>
        <Icon className="size-3.5 shrink-0" aria-hidden />
        {note.text}
      </p>
      <MessageComposer
        key={visitor.id}
        distributionId={`embed-${visitor.id}`}
        counterpartName={visitorDisplayName(visitor)}
        onUploadAttachment={aiWidgetApi.uploadVisitorAttachment}
        persistDraft={false}
        onSend={handleSend}
      />
    </div>
  );
}
