"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChatInput } from "@/app/ai/components/chat-input";
import { ChatMessage, StreamingMessage } from "@/app/ai/components/chat-message";
import { ThinkingIndicator } from "@/app/ai/components/thinking-indicator";
import { CompareTray } from "@/app/(web)/search/components/compare-tray";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CourseCard, Message } from "@/app/ai/apis/types";
import { embedApi, type EmbedPublicConfig } from "../apis";
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

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    embedApi.resolveConfig(embedKey).then(setConfig, (e: Error) => setConfigError(e.message));
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

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header
        className="flex items-center gap-3 border-b px-4 py-3"
        style={config?.brand_color ? { borderTopColor: config.brand_color, borderTopWidth: 3 } : undefined}
      >
        {config?.logo_url && (
          <Image src={config.logo_url} alt={name} width={28} height={28} className="rounded" unoptimized />
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className="text-xs text-muted-foreground">AI counsellor · powered by Globaly</p>
        </div>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !sending && (
          <p className="pt-10 text-center text-sm text-muted-foreground">
            Ask me anything about {name}&apos;s courses and services.
          </p>
        )}
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
        {error && <p className="text-center text-sm text-destructive">{error}</p>}
        <div ref={bottomRef} />
      </div>

      <div className="border-t px-4 py-3">
        <ChatInput value={input} onChange={setInput} onSend={send} disabled={sending} />
      </div>
      <CompareTray />
    </div>
  );
}
