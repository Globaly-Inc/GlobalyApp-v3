"use client";

import { useEffect, useRef } from "react";
import { useAppSelector } from "@/lib/hooks";
import { ChatMessage, StreamingMessage } from "./chat-message";
import { stripStructuredBlocks } from "../utils";
import { ThinkingIndicator } from "./thinking-indicator";

type ChatMessagesProps = {
  onChipClick: (chip: string) => void;
};

export function ChatMessages({ onChipClick }: ChatMessagesProps) {
  const activeSessionId = useAppSelector((s) => s.aiChat.activeSessionId);
  const messages = useAppSelector((s) => (activeSessionId ? s.aiChat.messages[activeSessionId] ?? [] : []));
  const sendStatus = useAppSelector((s) => s.aiChat.sendStatus);
  const streamingContent = useAppSelector((s) => s.aiChat.streamingContent);
  const streamingCards = useAppSelector((s) => s.aiChat.streamingCards);
  const streamingChips = useAppSelector((s) => s.aiChat.streamingChips);
  const traceSteps = useAppSelector((s) => s.aiChat.traceSteps);

  const bottomRef = useRef<HTMLDivElement>(null);

  const isStreaming = sendStatus === "loading";
  const showThinking = isStreaming && !streamingContent;

  // Auto-scroll to bottom on new messages or streaming content
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streamingContent, traceSteps.length]);

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} onChipClick={onChipClick} />
        ))}

        {showThinking && <ThinkingIndicator steps={traceSteps} />}

        {isStreaming && streamingContent && (
          <StreamingMessage
            content={stripStructuredBlocks(streamingContent)}
            cards={streamingCards}
            chips={streamingChips}
            onChipClick={onChipClick}
          />
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
