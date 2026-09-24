"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { Expand } from "lucide-react";
import { ChatInput } from "@/app/ai/components/chat-input";
import { ChatMessage, StreamingMessage } from "@/app/ai/components/chat-message";
import { ThinkingIndicator } from "@/app/ai/components/thinking-indicator";
import { SuggestedStarters } from "@/app/ai/components/suggested-starters";
import { CompareTray } from "@/app/(web)/search/components/compare-tray";
import { AlyOrbIcon } from "@/components/aly-orb-icon";
import { Button } from "@/components/ui/button";
import type { CourseCard, Message } from "@/app/ai/apis/types";
import { embedApi, type EmbedContactPrompt, type EmbedEndPrompt, type EmbedPublicConfig } from "../apis";
import { ContactCaptureCard } from "./contact-capture-card";
import { ConversationEndCard } from "./conversation-end-card";
// The backend streams the model's raw text, fences and all — it only strips them for the
// copy it PERSISTS, so every client renders its own. The main chat does this at all three
// of its render points (chat-messages.tsx, and both commits in ai-chat-slice); the widget
// renders StreamingMessage directly and kept none of them, so the block JSON showed as code.
import { stripStructuredBlocks } from "@/app/ai/utils";
import { toMessage } from "../utils";
import { embedStarters } from "../const";
import { uuid } from "@/lib/utils";

const FINGERPRINT_KEY = "globaly_embed_fp";

function getFingerprint(): string {
  let fp = localStorage.getItem(FINGERPRINT_KEY);
  if (!fp) {
    fp = uuid();
    localStorage.setItem(FINGERPRINT_KEY, fp);
  }
  return fp;
}

type EmbedChatViewProps = { embedKey: string };

export function EmbedChatView({ embedKey }: EmbedChatViewProps) {
  const [config, setConfig] = useState<EmbedPublicConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [streamCards, setStreamCards] = useState<CourseCard[]>([]);
  const [streamChips, setStreamChips] = useState<string[]>([]);
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

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    embedApi.resolveConfig(embedKey).then(setConfig, (e: Error) => setConfigError(e.message));
    // Resume the visitor's thread with this widget. Reopening the launcher used to show
    // an empty panel even though the backend had the conversation.
    embedApi.getThread(embedKey, getFingerprint()).then(({ messages: stored }) => {
      if (!stored.length) return;
      setMessages(stored.map((row) => toMessage(row, embedApi.toCourseCards(row.cards))));
    });
  }, [embedKey]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streamText, contactPrompt, endPrompt]);

  const send = async (content: string) => {
    if (sending) return;
    setInput("");
    setError(null);
    setSending(true);
    setStreamText("");
    setStreamCards([]);
    setStreamChips([]);
    setTraceSteps([]);
    // Typing instead of answering IS the answer. Both cards go; the backend already treats an
    // unanswered prompt as a decline and waits out the same cooldown before offering again.
    setContactPrompt(null);
    setEndPrompt(null);
    // ponytail: negative temp ids — the widget has no persisted messages, feedback stays hidden
    setMessages((prev) => [
      ...prev,
      { id: -prev.length - 1, session_id: 0, role: "user", content, cards: [], chips: [], blocks: [], feedback: null, created_at: new Date().toISOString() },
    ]);

    let text = "";
    let cards: CourseCard[] = [];
    let chips: string[] = [];
    try {
      await embedApi.sendMessage(
        { content, fingerprint: getFingerprint(), embed_key: embedKey },
        (event) => {
          if (event.type === "delta") { text += event.text; setStreamText(text); }
          else if (event.type === "cards") { cards = event.cards; setStreamCards(cards); }
          else if (event.type === "chips") { chips = event.chips; setStreamChips(chips); }
          else if (event.type === "trace") { setTraceSteps((prev) => [...prev, event.step]); }
          else if (event.type === "contact-prompt") { setContactPrompt(event.prompt); }
          else if (event.type === "end-prompt") { setEndPrompt(event.prompt); }
        },
      );
      setMessages((prev) => [
        ...prev,
        { id: -prev.length - 1, session_id: 0, role: "assistant", content: stripStructuredBlocks(text), cards, chips, blocks: [], feedback: null, created_at: new Date().toISOString() },
      ]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
      setStreamText("");
      setStreamCards([]);
      setStreamChips([]);
    }
  };

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

  const name = config?.display_name ?? "AI Counsellor";
  const isChatting = messages.length > 0 || sending;

  return (
    <div className="flex h-dvh flex-col bg-background">
      {/* Same shape as the in-app Ask Aly popover header: identity on the left, expand on
          the right. The brand colour stays a hairline accent so the header keeps reading
          as the counsellor's, not as a coloured banner. */}
      <header
        className="flex shrink-0 items-center gap-2.5 border-b px-4 py-2.5"
        style={config?.brand_color ? { borderTopColor: config.brand_color, borderTopWidth: 3 } : undefined}
      >
        {config?.logo_url ? (
          <Image src={config.logo_url} alt={name} width={28} height={28} className="size-7 rounded" unoptimized />
        ) : (
          <AlyOrbIcon className="size-7" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className="truncate text-xs text-muted-foreground">AI counsellor · powered by Globaly</p>
        </div>
        {framed && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Open in a new tab"
            title="Open in a new tab"
            render={<a href={`/embed/${encodeURIComponent(embedKey)}`} target="_blank" rel="noreferrer" />}
          >
            <Expand className="h-4 w-4" />
          </Button>
        )}
      </header>

      {isChatting ? (
        <div className="flex-1 overflow-y-auto">
          {/* Mirrors ChatMessages: one centred column, generous turn spacing. In the 380px
              panel the max-width is inert; in the expanded tab it stops the thread from
              running the full screen width. */}
          <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-6 sm:px-6">
            {messages.map((m) => (
              <ChatMessage key={m.id} message={m} onChipClick={send} />
            ))}
            {sending && !streamText && <ThinkingIndicator steps={traceSteps} />}
            {sending && streamText && (
              <StreamingMessage content={stripStructuredBlocks(streamText)} cards={streamCards} chips={streamChips} onChipClick={send} />
            )}
            {contactPrompt && !sending && (
              <ContactCaptureCard prompt={contactPrompt} onSubmit={submitContact} onSkip={skipContact} />
            )}
            {endPrompt && !sending && (
              <ConversationEndCard
                prompt={endPrompt}
                onEnd={endConversation}
                onContinue={continueConversation}
              />
            )}
            <div ref={bottomRef} className="h-2" />
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <SuggestedStarters
            onSelect={send}
            // Empty until the config lands: rendering the business set first and swapping it
            // for the institution's a moment later is a visible flip of the whole hero.
            categories={config ? embedStarters(config.owner_kind ?? "business") : []}
          />
        </div>
      )}

      {error && (
        <p className="border-t bg-destructive/10 px-4 py-2 text-center text-sm text-destructive">{error}</p>
      )}

      <ChatInput value={input} onChange={setInput} onSend={send} disabled={sending} />
      <CompareTray />
    </div>
  );
}
