"use client";

import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import type { WidgetVisitor } from "@/app/business/ai-widget/apis/types";
import { fetchEmbedNotes, fetchEmbedTranscript, markEmbedChatRead } from "../store/embed-chats-slice";
import { EmbedChatComposer } from "./embed-chat-composer";
import { EmbedConversationHeader } from "./embed-conversation-header";
import { EmbedTranscript } from "./embed-transcript";
import { EmbedVisitorPanel } from "./embed-visitor-panel";
import { useEmbedChatActions } from "./use-embed-chat-actions";

/**
 * How often the open chat checks for new messages. Faster than the enquiry thread's 15s: a
 * visitor on a website waits for an answer the way someone in live chat does.
 * ponytail: polling; an SSE stream replaces it if 5s ever feels slow.
 */
const POLL_MS = 5_000;

/**
 * An AI conversation (embed widget chat) in a support-inbox layout, modelled on GlobalyOS's
 * Support Inbox: the header with who is answering, the transcript, and a composer that lets
 * staff take the chat over from the AI. The visitor panel sits beside it from lg up.
 */
export function EmbedConversationView({ visitor, onBack }: Readonly<{ visitor: WidgetVisitor; onBack: () => void }>) {
  const dispatch = useAppDispatch();
  const messages = useAppSelector((s) => s.embedChats.transcripts[visitor.id]);
  const notes = useAppSelector((s) => s.embedChats.notes[visitor.id]);
  const failed = useAppSelector((s) => s.embedChats.transcriptStatus[visitor.id] === "failed");
  const actions = useEmbedChatActions(visitor.id);

  // Strict Mode double-invokes effects; only refetch when the open chat actually changes.
  const fetchedFor = useRef<number | null>(null);
  useEffect(() => {
    if (fetchedFor.current === visitor.id) return;
    fetchedFor.current = visitor.id;
    dispatch(fetchEmbedTranscript(visitor.id));
    dispatch(fetchEmbedNotes(visitor.id));
  }, [dispatch, visitor.id]);

  // Skipped while the tab is hidden — nobody is reading, and the next visible tick catches up.
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      dispatch(fetchEmbedTranscript(visitor.id));
      dispatch(fetchEmbedNotes(visitor.id));
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [dispatch, visitor.id]);

  // Opening the chat is reading it — and so is a message arriving while it's open.
  // The ref stops Strict Mode's second run posting the same read twice.
  const unread = visitor.unread_count ?? 0;
  const readFor = useRef<string | null>(null);
  useEffect(() => {
    const key = `${visitor.id}:${unread}`;
    if (unread === 0 || readFor.current === key) return;
    readFor.current = key;
    dispatch(markEmbedChatRead(visitor.id));
  }, [dispatch, visitor.id, unread]);

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <EmbedConversationHeader visitor={visitor} actions={actions} onBack={onBack} />
        <EmbedTranscript visitor={visitor} messages={messages} notes={notes} failed={failed} />
        <EmbedChatComposer visitor={visitor} />
      </div>
      {/* Hidden below lg, as the enquiry chat's info panel is: at md the transcript beside
          the list and a panel would be too narrow to read. */}
      <aside className="hidden w-72 shrink-0 border-l border-border bg-card lg:block" aria-label="Visitor details">
        <EmbedVisitorPanel visitor={visitor} actions={actions} />
      </aside>
    </div>
  );
}
