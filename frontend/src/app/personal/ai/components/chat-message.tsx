"use client";

import type { CourseCard as CourseCardType, Message } from "../apis/types";
import { CourseCard } from "./course-card";
import { FeedbackButtons } from "./feedback-buttons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ChatMessageProps = {
  message: Message;
  onChipClick?: (chip: string) => void;
};

/**
 * ponytail: Minimal markdown renderer — handles **bold**, *italic*, `code`,
 * ```code blocks```, and - lists via regex. Swap for a real renderer if
 * the AI starts returning complex markdown (tables, nested lists, etc.).
 */
function SimpleMarkdown({ text }: { text: string }) {
  const blocks = text.split(/```([\s\S]*?)```/g);

  return (
    <div className="space-y-2 text-sm leading-relaxed whitespace-pre-wrap">
      {blocks.map((block, i) => {
        if (i % 2 === 1) {
          // Code block
          return (
            <pre key={i} className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
              <code>{block.trim()}</code>
            </pre>
          );
        }
        // Inline formatting
        const html = block
          .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
          .replace(/\*(.+?)\*/g, "<em>$1</em>")
          .replace(/`(.+?)`/g, '<code class="rounded bg-muted px-1 py-0.5 text-xs">$1</code>');
        return <span key={i} dangerouslySetInnerHTML={{ __html: html }} />;
      })}
    </div>
  );
}

export function ChatMessage({ message, onChipClick }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex flex-col gap-2", isUser ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[85%] px-4 py-2.5 shadow-xs",
          isUser
            ? "rounded-2xl rounded-br-md bg-primary text-primary-foreground"
            : "rounded-2xl rounded-bl-md border bg-muted/60 text-foreground",
        )}
      >
        {isUser ? (
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        ) : (
          <SimpleMarkdown text={message.content} />
        )}
      </div>

      {/* Course cards */}
      {message.cards.length > 0 && (
        <div className="flex max-w-[85%] flex-col gap-2">
          {message.cards.map((card, i) => (
            <CourseCard key={i} card={card} />
          ))}
        </div>
      )}

      {/* Chips */}
      {message.chips.length > 0 && (
        <div className="flex max-w-[85%] flex-wrap gap-1.5">
          {message.chips.map((chip) => (
            <Button
              key={chip}
              variant="outline"
              size="sm"
              onClick={() => onChipClick?.(chip)}
            >
              {chip}
            </Button>
          ))}
        </div>
      )}

      {/* Feedback */}
      {!isUser && message.id > 0 && (
        <FeedbackButtons messageId={message.id} feedback={message.feedback} />
      )}
    </div>
  );
}

/**
 * Streaming variant — renders partial content without a real Message object.
 */
export function StreamingMessage({
  content,
  cards,
  chips,
  onChipClick,
}: {
  content: string;
  cards: CourseCardType[];
  chips: string[];
  onChipClick?: (chip: string) => void;
}) {
  return (
    <div className="flex flex-col items-start gap-2">
      {content && (
        <div className="max-w-[85%] rounded-2xl rounded-bl-md border bg-muted/60 px-4 py-2.5 text-foreground shadow-xs">
          <SimpleMarkdown text={content} />
        </div>
      )}
      {cards.length > 0 && (
        <div className="flex max-w-[85%] flex-col gap-2">
          {cards.map((card, i) => (
            <CourseCard key={i} card={card} />
          ))}
        </div>
      )}
      {chips.length > 0 && (
        <div className="flex max-w-[85%] flex-wrap gap-1.5">
          {chips.map((chip) => (
            <Button key={chip} variant="outline" size="sm" onClick={() => onChipClick?.(chip)}>
              {chip}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
