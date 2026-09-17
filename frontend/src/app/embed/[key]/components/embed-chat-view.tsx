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
import { Input } from "@/components/ui/input";
import type { CourseCard, Message } from "@/app/ai/apis/types";
import { embedApi, type EmbedPublicConfig } from "../apis";
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

/** Inline signup nudge shown after the first AI response, stays dismissible. */
function GuestRegistrationCard({ fingerprint, onDismiss }: { fingerprint: string; onDismiss: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const handleSignup = () => {
    const params = new URLSearchParams({ fp: fingerprint });
    if (name.trim()) params.set("name", name.trim());
    if (email.trim()) params.set("email", email.trim());
    window.open(`/auth/sign-up?${params}`, "_blank");
  };

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <p className="mb-0.5 text-sm font-semibold">Save this conversation</p>
      <p className="mb-3 text-xs text-muted-foreground">
        Create a free account to get 10 credits and keep your history.
      </p>
      <div className="flex flex-col gap-2">
        <Input
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-8 text-xs"
        />
        <Input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSignup()}
          className="h-8 text-xs"
        />
        <div className="flex gap-2">
          <Button size="sm" className="flex-1" onClick={handleSignup}>
            Sign Up Free
          </Button>
          <Button size="sm" variant="ghost" onClick={onDismiss}>
            Later
          </Button>
        </div>
      </div>
    </div>
  );
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
  const [signupDismissed, setSignupDismissed] = useState(false);
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
      // Already past the first reply, so the signup nudge would be re-offered on every
      // reopen — it belongs to the first answer only.
      setSignupDismissed(true);
    });
  }, [embedKey]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streamText]);

  const send = async (content: string) => {
    if (sending) return;
    setInput("");
    setError(null);
    setSending(true);
    setStreamText("");
    setStreamCards([]);
    setStreamChips([]);
    setTraceSteps([]);
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
        },
      );
      setMessages((prev) => [
        ...prev,
        { id: -prev.length - 1, session_id: 0, role: "assistant", content: text, cards, chips, blocks: [], feedback: null, created_at: new Date().toISOString() },
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

  if (configError) {
    return <div className="flex h-dvh items-center justify-center p-6 text-center text-sm text-muted-foreground">{configError}</div>;
  }

  const name = config?.display_name ?? "AI Counsellor";
  const hasFirstAiResponse = messages.some((m) => m.role === "assistant");
  const showSignupCard = hasFirstAiResponse && !signupDismissed && !sending;
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
              <StreamingMessage content={streamText} cards={streamCards} chips={streamChips} onChipClick={send} />
            )}
            {showSignupCard && (
              <GuestRegistrationCard fingerprint={getFingerprint()} onDismiss={() => setSignupDismissed(true)} />
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
