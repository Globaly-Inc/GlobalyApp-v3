"use client";

import { useState } from "react";
import { Bot, CheckCircle2, Clock, FileText, Hand, RotateCcw, Smartphone, StickyNote, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MessageComposer } from "@/components/chat/message-composer";
import { useAppDispatch } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { aiWidgetApi } from "@/app/business/ai-widget/apis";
import { visitorDisplayName } from "@/app/business/ai-widget/utils";
import type { WidgetVisitor } from "@/app/business/ai-widget/apis/types";
import { INBOX_CHANNELS } from "../const";
import { addEmbedNote, sendEmbedMessage } from "../store/embed-chats-slice";
import { channelOf, embedChatState, handlerLabel, isPhoneApp, whatsappWindowOpen } from "../utils";
import { TemplatePickerDialog } from "./template-picker-dialog";
import type { EmbedChatActions } from "./use-embed-chat-actions";

/** A locked composer: says who answers instead of offering a box that would change it silently. */
function Locked({ icon: Icon, title, body, tone, children }: Readonly<{
  icon: typeof Bot; title: string; body: string; tone: string; children?: React.ReactNode;
}>) {
  return (
    <div className={cn("mx-3 my-2 flex flex-wrap items-center gap-3 rounded-xl border border-dashed px-3.5 py-3", tone)}>
      <Icon className="size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs opacity-85">{body}</p>
      </div>
      {children}
    </div>
  );
}

/**
 * Reply or Note. A note never touches who is answering: it goes to its own endpoint, so writing
 * one never takes the conversation over from AI, and it never reaches the customer.
 *
 * Replying is only possible when YOU have the conversation: in AI mode the box is locked with
 * "Take over to reply", so AI mode and human mode can't be confused.
 */
export function EmbedChatComposer({ visitor, actions }: Readonly<{ visitor: WidgetVisitor; actions: EmbedChatActions }>) {
  const dispatch = useAppDispatch();
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const [templates, setTemplates] = useState(false);
  const state = embedChatState(visitor);
  const name = visitorDisplayName(visitor).split(" ")[0];
  const channel = channelOf(visitor);
  const busy = actions.pending !== null;

  const handleSend = async (body: string, attachments: string[]) => {
    const result = mode === "note"
      ? await dispatch(addEmbedNote({ visitorId: visitor.id, body, attachments }))
      : await dispatch(sendEmbedMessage({ visitorId: visitor.id, body, attachments }));
    if ("error" in result) {
      toast.error(mode === "note" ? "Couldn't save your note" : "Couldn't send your reply", { description: result.error.message ?? "Please try again." });
      return false;
    }
    return true;
  };

  const box = (placeholder?: string, initialValue?: string) => (
    <MessageComposer
      // Keyed by mode too: a half-typed reply must not become a note on a tab switch.
      key={`${visitor.id}-${mode}`}
      placeholder={placeholder}
      distributionId={`embed-${visitor.id}`}
      counterpartName={visitorDisplayName(visitor)}
      onUploadAttachment={aiWidgetApi.uploadVisitorAttachment}
      persistDraft={false}
      initialValue={initialValue}
      onSend={handleSend}
    />
  );

  let reply: React.ReactNode;
  if (state === "resolved") {
    reply = (
      <Locked icon={CheckCircle2} tone="border-emerald-300 bg-emerald-500/10 text-emerald-800" title="This conversation is resolved." body={`Reopen it to reply, or let AI pick it up when ${name} writes again.`}>
        <Button size="sm" variant="outline" disabled={busy} onClick={actions.reopen}><RotateCcw className="size-3.5" aria-hidden />Reopen</Button>
      </Locked>
    );
  } else if (state === "human" && isPhoneApp(visitor)) {
    reply = (
      <Locked icon={Smartphone} tone="border-cyan-300 bg-cyan-500/10 text-cyan-900" title="Replies are coming from the WhatsApp Business app." body="Take over here to reply from the Inbox instead.">
        <Button size="sm" disabled={busy} onClick={actions.takeOver}><Hand className="size-3.5" aria-hidden />Take over here</Button>
      </Locked>
    );
  } else if (state === "human" && !visitor.handled_by_me) {
    reply = (
      <Locked icon={UserRound} tone="border-cyan-300 bg-cyan-500/10 text-cyan-900" title={`${handlerLabel(visitor)} is handling this conversation.`} body={`Take over from ${handlerLabel(visitor)} to reply, or leave an internal note.`}>
        <Button size="sm" disabled={busy} onClick={actions.takeOver}><Hand className="size-3.5" aria-hidden />Take over</Button>
      </Locked>
    );
  } else if (state !== "human") {
    const draft = visitor.attention_reason === "suggest";
    reply = (
      <Locked
        icon={Bot}
        tone="border-primary/25 bg-primary/5 text-primary"
        title={draft ? "AI drafted a reply." : state === "waiting" ? `${name} is waiting for a person.` : `AI is replying to ${name} automatically.`}
        body={draft ? "Take over to review it and send it yourself." : "Take over to reply yourself. AI pauses until you resume it, or 15 minutes pass with no reply from you."}
      >
        <Button size="sm" disabled={busy} onClick={actions.takeOver}><Hand className="size-3.5" aria-hidden />{draft ? "Review draft" : "Take over to reply"}</Button>
      </Locked>
    );
  } else if (!whatsappWindowOpen(visitor)) {
    reply = (
      <Locked icon={Clock} tone="border-amber-300 bg-amber-50 text-amber-900" title="WhatsApp's 24-hour window has closed." body="Send an approved template to restart the conversation.">
        <Button size="sm" onClick={() => setTemplates(true)}><FileText className="size-3.5" aria-hidden />Choose template</Button>
      </Locked>
    );
  } else {
    reply = (
      <>
        <p className="mx-3 mt-2 flex items-center gap-2 rounded-md bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-900">
          <UserRound className="size-3.5 shrink-0" aria-hidden />
          {`Replying as you${channel === "ai_embed" ? "" : ` on ${INBOX_CHANNELS[channel].label}`} · AI is paused`}
        </p>
        {/* A suggest-only draft starts in the box, for a person to review and send. */}
        {box(undefined, visitor.ai_draft ?? undefined)}
      </>
    );
  }

  return (
    <div className={cn("shrink-0 border-t border-border", mode === "note" && "bg-amber-50/60")}>
      <div className="mx-3 mt-2 flex gap-1" role="tablist" aria-label="Compose">
        {(["reply", "note"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium",
              mode === m ? (m === "note" ? "bg-amber-100 text-amber-900" : "bg-primary/10 text-primary") : "text-muted-foreground hover:bg-muted",
            )}
          >
            {m === "reply" ? "Reply" : "Note"}
          </button>
        ))}
      </div>
      {mode === "note" ? (
        <>
          <p className="mx-3 mt-2 flex items-center gap-2 rounded-md bg-amber-500/15 px-3 py-1.5 text-xs text-amber-900">
            <StickyNote className="size-3.5 shrink-0" aria-hidden />
            Internal note. Only your team sees it — the customer and AI never do.
          </p>
          {box("Write a note for your team…")}
        </>
      ) : reply}
      {channel === "whatsapp" && <TemplatePickerDialog visitor={visitor} open={templates} onOpenChange={setTemplates} />}
    </div>
  );
}
