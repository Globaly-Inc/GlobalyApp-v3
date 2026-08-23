"use client";

import { useState } from "react";
import { Check, Copy, Paperclip, Sparkles } from "lucide-react";
import type { CourseCard as CourseCardType, Message, ResponseBlock } from "../apis/types";
import { CourseCard } from "./course-card";
import { FeedbackButtons } from "./feedback-buttons";
import { MessageBlocks } from "./message-blocks";
import { MessageMarkdown } from "./message-markdown";
import { Button } from "@/components/ui/button";

type ChatMessageProps = {
  message: Message;
  onChipClick?: (chip: string) => void;
};

/** Cards size themselves to the container, not the viewport — the same grid has to
 * work in the 380px widget popover and on the full-width chat page. */
const CARD_GRID = "grid w-full grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Button variant="ghost" size="icon-xs" onClick={copy} aria-label={copied ? "Copied" : "Copy message"}>
      {copied ? <Check className="text-primary" /> : <Copy />}
    </Button>
  );
}

/** Small brand mark in the gutter, so a bubbleless assistant turn still reads as "not you".
 * Hidden on the narrowest containers, where the column can't spare 40px. */
function AssistantMark() {
  return (
    <span className="mt-0.5 hidden size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary sm:flex">
      <Sparkles className="size-3.5" />
    </span>
  );
}

function Attachments({ paths }: { paths: string[] }) {
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {paths.map((path) => (
        <span
          key={path}
          className="flex items-center gap-1 rounded-full border bg-muted px-2.5 py-1 text-xs text-muted-foreground"
        >
          <Paperclip className="size-3" />
          <span className="max-w-40 truncate">{path.split("/").pop()}</span>
        </span>
      ))}
    </div>
  );
}

function Chips({ chips, onChipClick }: { chips: string[]; onChipClick?: (chip: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5 pt-1">
      {chips.map((chip) => (
        <Button
          key={chip}
          variant="outline"
          size="sm"
          className="h-7 rounded-full text-xs font-normal text-muted-foreground hover:text-foreground"
          onClick={() => onChipClick?.(chip)}
        >
          {chip}
        </Button>
      ))}
    </div>
  );
}

/**
 * Assistant turns are bubbleless full-width prose (claude.ai-style) so long
 * answers, tables and cards get the whole column; only the user's own turns are
 * bubbled, which is what keeps the two sides distinguishable at a glance.
 */
function AssistantTurn({
  content,
  cards,
  chips,
  blocks,
  onChipClick,
  footer,
}: {
  content: string;
  cards: CourseCardType[];
  chips: string[];
  blocks: ResponseBlock[];
  onChipClick?: (chip: string) => void;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex w-full gap-3">
      <AssistantMark />
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {content && <MessageMarkdown text={content} />}
        {blocks.length > 0 && <MessageBlocks blocks={blocks} onAction={onChipClick} />}
        {cards.length > 0 && (
          <div className={CARD_GRID}>
            {cards.map((card, i) => (
              <CourseCard key={card.id ?? i} card={card} />
            ))}
          </div>
        )}
        {chips.length > 0 && <Chips chips={chips} onChipClick={onChipClick} />}
        {footer}
      </div>
    </div>
  );
}

export function ChatMessage({ message, onChipClick }: ChatMessageProps) {
  if (message.role === "user") {
    return (
      <div className="flex flex-col items-end gap-2">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-muted px-4 py-2.5">
          <p className="text-[0.9375rem] leading-relaxed whitespace-pre-wrap text-foreground">
            {message.content}
          </p>
        </div>
        {!!message.attachments?.length && <Attachments paths={message.attachments} />}
      </div>
    );
  }

  return (
    <AssistantTurn
      content={message.content}
      cards={message.cards}
      chips={message.chips}
      blocks={message.blocks}
      onChipClick={onChipClick}
      footer={
        // Optimistic rows have no server id yet, so there's nothing to rate.
        message.id > 0 ? (
          <div className="flex items-center gap-0.5 text-muted-foreground opacity-70 transition-opacity hover:opacity-100">
            <CopyButton text={message.content} />
            <FeedbackButtons messageId={message.id} feedback={message.feedback} />
          </div>
        ) : null
      }
    />
  );
}

/**
 * Streaming variant — renders partial content without a real Message object.
 */
export function StreamingMessage({
  content,
  cards,
  chips,
  blocks = [],
  onChipClick,
}: {
  content: string;
  cards: CourseCardType[];
  chips: string[];
  blocks?: ResponseBlock[];
  onChipClick?: (chip: string) => void;
}) {
  return (
    <AssistantTurn content={content} cards={cards} chips={chips} blocks={blocks} onChipClick={onChipClick} />
  );
}
