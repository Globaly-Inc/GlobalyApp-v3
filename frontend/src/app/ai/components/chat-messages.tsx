"use client";

import { useEffect, useRef } from "react";
import { useAppSelector } from "@/lib/hooks";
import { ChatMessage, StreamingMessage } from "./chat-message";
import { stripStructuredBlocks } from "../utils";
import { ThinkingIndicator } from "./thinking-indicator";

type ChatMessagesProps = {
  onChipClick: (chip: string) => void;
  onSend: (value: string) => void;
};

export function ChatMessages({ onChipClick, onSend }: ChatMessagesProps) {
  const activeSessionId = useAppSelector((s) => s.aiChat.activeSessionId);
  const messages = useAppSelector((s) => (activeSessionId ? s.aiChat.messages[activeSessionId] ?? [] : []));
  const sendStatus = useAppSelector((s) => s.aiChat.sendStatus);
  const streamingContent = useAppSelector((s) => s.aiChat.streamingContent);
  const streamingCards = useAppSelector((s) => s.aiChat.streamingCards);
  const streamingChips = useAppSelector((s) => s.aiChat.streamingChips);
  const streamingBlocks = useAppSelector((s) => s.aiChat.streamingBlocks);
  const traceSteps = useAppSelector((s) => s.aiChat.traceSteps);

  const bottomRef = useRef<HTMLDivElement>(null);

  const isStreaming = sendStatus === "loading";
  const showThinking = isStreaming && !streamingContent;

  // Auto-scroll to bottom on new messages or streaming content
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streamingContent, traceSteps.length]);

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Turn spacing (gap-8) carries the visual separation that the assistant
          bubble used to provide. */}
      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-6 sm:px-6">
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} onChipClick={onChipClick} onSend={onSend} />
        ))}

        {showThinking && <ThinkingIndicator steps={traceSteps} />}

        {isStreaming && streamingContent && (
          <StreamingMessage
            content={stripStructuredBlocks(streamingContent)}
            cards={streamingCards}
            chips={streamingChips}
            blocks={streamingBlocks}
            onChipClick={onChipClick}
            onSend={onSend}
          />
        )}

        <div ref={bottomRef} className="h-2" />
      </div>
    </div>
  );
}
