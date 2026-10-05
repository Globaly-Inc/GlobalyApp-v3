"use client";

import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from "react";
import { ChatInput } from "@/app/ai/components/chat-input";
import { StreamingMessage } from "@/app/ai/components/chat-message";
import { ThinkingIndicator } from "@/app/ai/components/thinking-indicator";
import { SuggestedStarters } from "@/app/ai/components/suggested-starters";
import { CompareTray } from "@/app/(web)/search/components/compare-tray";
import type { CourseCard, ResponseBlock } from "@/app/ai/apis/types";
import { embedApi, type EmbedContactPrompt, type EmbedEndPrompt, type EmbedPublicConfig } from "../apis";
import { ContactCaptureCard } from "./contact-capture-card";
import { ConversationEndCard } from "./conversation-end-card";
import { ThreadMessages } from "./thread-messages";
import { WaitingCard } from "./waiting-card";
import { WidgetHeader } from "./widget-header";
// The backend streams the model's raw text, fences and all — it only strips them for the
// copy it PERSISTS, so every client renders its own. The main chat does this at all three
// of its render points (chat-messages.tsx, and both commits in ai-chat-slice); the widget
// renders StreamingMessage directly and kept none of them, so the block JSON showed as code.
import { stripStructuredBlocks } from "@/app/ai/utils";
import { getFingerprint, toMessage, widgetTheme, withNewAgentRows, type WidgetMessage } from "../utils";
import { DEFAULT_WIDGET_NAME, embedStarters, FP_MESSAGE, STARTED_MESSAGE } from "../const";

/** How often the open widget checks for staff replies. 12/min, inside the session route's 30/min. */
const POLL_MS = 5_000;


type EmbedChatViewProps = { embedKey: string };

export function EmbedChatView({ embedKey }: EmbedChatViewProps) {
  const [config, setConfig] = useState<EmbedPublicConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [messages, setMessages] = useState<WidgetMessage[]>([]);
  // Who is answering, from the server: a staff member's name, or waiting for one. Polled.
  const [agentName, setAgentName] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [streamCards, setStreamCards] = useState<CourseCard[]>([]);
  const [streamChips, setStreamChips] = useState<string[]>([]);
  const [streamBlocks, setStreamBlocks] = useState<ResponseBlock[]>([]);
  const [traceSteps, setTraceSteps] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Server-decided: the backend emits this when the visitor has had enough turns for the ask
  // to feel earned, and stays quiet otherwise. The widget never decides when to ask.
  const [contactPrompt, setContactPrompt] = useState<EmbedContactPrompt | null>(null);
  // The counsellor's offer to wrap up, emitted when it judges the enquiry answered. At most one
  // of these two is ever set — the server arbitrates so the visitor never gets both at once.
  const [endPrompt, setEndPrompt] = useState<EmbedEndPrompt | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fetchedRef = useRef(false);
  // The expand affordance only makes sense inside the host's iframe — on the full tab it
  // would just reopen the page it is already on. Read after hydration (server snapshot
  // false) so prerender and client agree; nothing to subscribe to, the value never changes.
  const framed = useSyncExternalStore(() => () => {}, () => window.self !== window.top, () => false);

  // Once there is a conversation (resumed or just begun), the host's teaser card has done its
  // job. "*" for the same reason as CLOSE_MESSAGE: the host origin is unknown, and the word leaks nothing.
  const hasConversation = messages.length > 0;
  useEffect(() => {
    if (framed && hasConversation) window.parent.postMessage({ type: STARTED_MESSAGE }, "*");
  }, [framed, hasConversation]);

  const run = async (content: string, resume: boolean) => {
    if (sending) return;
    if (!resume) setInput("");
    setError(null);
    setSending(true);
    setStreamText("");
    setStreamCards([]);
    setStreamChips([]);
    setStreamBlocks([]);
    setTraceSteps([]);
    // Typing instead of answering IS the answer. Both cards go; the backend already treats an
    // unanswered prompt as a decline and waits out the same cooldown before offering again.
    setContactPrompt(null);
    setEndPrompt(null);
    // ponytail: negative temp ids — the widget has no persisted messages, feedback stays hidden
    if (!resume) setMessages((prev) => [
      ...prev,
      { id: -prev.length - 1, session_id: 0, role: "user", content, cards: [], chips: [], blocks: [], feedback: null, created_at: new Date().toISOString() },
    ]);

    let text = "";
    let cards: CourseCard[] = [];
    let chips: string[] = [];
    let blocks: ResponseBlock[] = [];
    try {
      await embedApi.sendMessage(
        { content, fingerprint: getFingerprint(), embed_key: embedKey, ...(resume ? { resume: true } : {}) },
        (event) => {
          if (event.type === "delta") { text += event.text; setStreamText(text); }
          else if (event.type === "cards") { cards = event.cards; setStreamCards(cards); }
          else if (event.type === "chips") { chips = event.chips; setStreamChips(chips); }
          else if (event.type === "blocks") { blocks = event.blocks; setStreamBlocks(blocks); }
          else if (event.type === "trace") { setTraceSteps((prev) => [...prev, event.step]); }
          else if (event.type === "contact-prompt") { setContactPrompt(event.prompt); }
          else if (event.type === "end-prompt") { setEndPrompt(event.prompt); }
          else if (event.type === "handoff") { setAgentName(event.agentName); setWaiting(false); }
          else if (event.type === "handover") { setWaiting(true); }
        },
      );
      // A person is handling the chat or being waited for: the message was delivered, and there
      // is no AI reply to draw — an empty bubble here would read as the AI saying nothing.
      if (!text && !cards.length && !chips.length && !blocks.length) return;
      setMessages((prev) => [
        ...prev,
        { id: -prev.length - 1, session_id: 0, role: "assistant", content: stripStructuredBlocks(text), cards, chips, blocks, feedback: null, created_at: new Date().toISOString() },
      ]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
      setStreamText("");
      setStreamCards([]);
      setStreamChips([]);
      setStreamBlocks([]);
    }
  };
  const send = (content: string) => run(content, false);
  // Called by the thread reads above; the reply streams like any other, minus a visitor bubble.
  const resume = useEffectEvent(() => void run("", true));

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    embedApi.resolveConfig(embedKey).then(setConfig, (e: Error) => setConfigError(e.message));
    // Inside a host page: hand our visitor id to embed.js, which keeps it in first-party storage
    // and gives it back next visit — iframe storage alone is partitioned or wiped by some browsers.
    if (window.parent !== window) window.parent.postMessage({ type: FP_MESSAGE, fp: getFingerprint() }, "*");
    // Resume the visitor's thread with this widget. Reopening the launcher used to show
    // an empty panel even though the backend had the conversation.
    embedApi.getThread(embedKey, getFingerprint()).then((thread) => {
      setAgentName(thread.agent_name ?? null);
      setWaiting(thread.waiting ?? false);
      // So the first poll can tell if a hold seen here lifts before it runs.
      heldRef.current = !!thread.agent_name || !!thread.waiting;
      if (!thread.messages.length) return;
      setMessages(thread.messages.map((row) => toMessage(row, embedApi.toCourseCards(row.cards))));
      // Back after a person had the chat and left a question unanswered: the AI answers it now.
      if (!thread.agent_name && !thread.waiting && thread.messages.at(-1)?.role === "user") resume();
    });
  }, [embedKey]);

  // Staff replies arrive from the Inbox, not as the answer to anything the visitor sent, so the
  // open widget polls for them. Paused while a send is streaming and while the tab is hidden.
  const sendingRef = useRef(false);
  const heldRef = useRef(false);
  useEffect(() => {
    sendingRef.current = sending;
  }, [sending]);
  useEffect(() => {
    const id = window.setInterval(() => {
      if (sendingRef.current || document.visibilityState !== "visible") return;
      embedApi.getThread(embedKey, getFingerprint()).then((thread) => {
        if (sendingRef.current) return;
        setAgentName(thread.agent_name ?? null);
        setWaiting(thread.waiting ?? false);
        setMessages((prev) => withNewAgentRows(prev, thread.messages, embedApi.toCourseCards));
        // The person's 15 minutes ran out (the hold just lifted) with the visitor's question
        // unanswered: the AI picks it up without waiting for them to type again. Only on the
        // transition, so a normal turn's not-yet-stored reply never looks unanswered.
        const held = heldRef.current;
        heldRef.current = !!thread.agent_name || !!thread.waiting;
        if (held && !heldRef.current && thread.messages.at(-1)?.role === "user") resume();
      });
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [embedKey]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streamText, contactPrompt, endPrompt]);


  const submitContact = async (contactName: string, email: string) => {
    await embedApi.submitContact({
      embed_key: embedKey,
      fingerprint: getFingerprint(),
      action: "submit",
      name: contactName,
      email,
    });
  };

  /** Returns whether a summary was actually queued, so the card only promises a real email. */
  const endConversation = async (): Promise<boolean> => {
    const res = await embedApi.confirmConversationEnd({
      embed_key: embedKey,
      fingerprint: getFingerprint(),
      action: "end",
    });
    return res.summary_queued === true;
  };

  const continueConversation = () => {
    // Optimistic, like skipping the contact card: the card goes now and the decision is
    // recorded in the background. A lost post just means the counsellor may offer again
    // sooner than the cooldown intended — not worth blocking the UI on.
    setEndPrompt(null);
    embedApi
      .confirmConversationEnd({ embed_key: embedKey, fingerprint: getFingerprint(), action: "continue" })
      .catch(() => {});
  };

  const rate = (rating: number, comment?: string) => {
    embedApi.submitRating({ embed_key: embedKey, fingerprint: getFingerprint(), rating, comment });
  };

  const skipContact = () => {
    // Optimistic: the card goes now and the decline is recorded in the background. If the
    // post fails the visitor simply gets asked again later, which is the same thing a
    // decline eventually leads to anyway — not worth blocking the UI on.
    setContactPrompt(null);
    embedApi
      .submitContact({ embed_key: embedKey, fingerprint: getFingerprint(), action: "skip" })
      .catch(() => {});
  };

  if (configError) {
    return <div className="flex h-dvh items-center justify-center p-6 text-center text-sm text-muted-foreground">{configError}</div>;
  }

  const name = config?.display_name?.trim() || DEFAULT_WIDGET_NAME;
  const isChatting = messages.length > 0 || sending;
  const theme = widgetTheme(config?.brand_color);

  return (
    // The brand colour replaces the app's primary for everything inside the panel — buttons,
    // chips, the heading, focus rings — so the widget reads as the institution's, not Globaly's.
    <div className="flex h-dvh flex-col bg-background" data-widget-brand style={theme.vars}>
      <WidgetHeader
        embedKey={embedKey}
        name={name}
        brandColor={config?.brand_color}
        framed={framed}
        fingerprint={framed ? getFingerprint() : ""}
        subtitle={
          agentName
            ? `${agentName} from the admissions team is replying`
            : waiting
              ? "Waiting for the admissions team"
              : config?.subtitle ?? "AI counsellor · powered by Globaly"
        }
      />

      {agentName && (
        <p className="shrink-0 border-b bg-primary/10 px-4 py-2 text-xs text-primary">
          👋 You&apos;re chatting with a person from the admissions team.
        </p>
      )}

      {isChatting ? (
        <div className="flex-1 overflow-y-auto">
          {/* Mirrors ChatMessages: one centred column, generous turn spacing. In the 380px
              panel the max-width is inert; in the expanded tab it stops the thread from
              running the full screen width. */}
          <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-6 sm:px-6">
            <ThreadMessages messages={messages} onChipClick={send} onSend={send} joinedAgent={agentName} />
            {sending && !streamText && <ThinkingIndicator steps={traceSteps} />}
            {sending && streamText && (
              <StreamingMessage
                content={stripStructuredBlocks(streamText)}
                cards={streamCards}
                chips={streamChips}
                blocks={streamBlocks}
                onChipClick={send}
                onSend={send}
              />
            )}
            {contactPrompt && !sending && (
              <ContactCaptureCard prompt={contactPrompt} onSubmit={submitContact} onSkip={skipContact} />
            )}
            {waiting && !agentName && !sending && <WaitingCard />}
            {endPrompt && !sending && (
              <ConversationEndCard
                prompt={endPrompt}
                onEnd={endConversation}
                onContinue={continueConversation}
                onRate={rate}
              />
            )}
            <div ref={bottomRef} className="h-2" />
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto" style={{ background: theme.heroBackground }}>
          {config?.greeting && (
            <p className="px-6 pt-6 text-center text-sm text-muted-foreground">{config.greeting}</p>
          )}
          <SuggestedStarters
            onSelect={send}
            // Empty until the config lands: rendering the business set first and swapping it
            // for the institution's a moment later is a visible flip of the whole hero.
            categories={config ? embedStarters(config.owner_kind ?? "business") : []}
          />
        </div>
      )}

      {/* Sits with the conversation rather than as a full-width band above the input: a failed
          turn is part of the thread, and a red bar spanning a 400px panel reads as the whole
          widget breaking. role=alert so it is announced, not just seen. */}
      {error && (
        <div className="px-4 pb-2">
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        </div>
      )}

      <ChatInput value={input} onChange={setInput} onSend={send} disabled={sending} />
      <p className="shrink-0 pb-2 text-center text-[11px] text-muted-foreground">Powered by Globaly · AI can make mistakes</p>
      {/* Above the composer, so the tray never covers the message box or Send. */}
      <CompareTray positionClass="bottom-28 right-3" />
    </div>
  );
}
