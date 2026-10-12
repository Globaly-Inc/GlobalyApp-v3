"use client";

import { useState } from "react";
import { Check, Copy, CornerUpLeft, Paperclip } from "lucide-react";
import type { CourseCard as CourseCardType, Message, ResponseBlock } from "../apis/types";
import { CourseCard } from "./course-card";
import { FeedbackButtons } from "./feedback-buttons";
import { MessageBlocks } from "./message-blocks";
import { MessageMarkdown } from "./message-markdown";
import { ScrollRow } from "@/components/scroll-row";
import { AlyOrbIcon } from "@/components/aly-orb-icon";
import { setReplyTo } from "../store/ai-chat-slice";
import { followUpChips, splitQuote } from "../utils";
import { useAppDispatch } from "@/lib/hooks";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ChatMessageProps = {
  message: Message;
  onChipClick?: (chip: string) => boolean | void;
  onSend?: (value: string) => boolean | void;
  /** A reply is streaming, so every tappable row in the thread refuses: grey them instead. */
  busy?: boolean;
};

/** Cards size themselves to the container, not the viewport — the same carousel has to
 * work in the 380px widget popover and on the full-width chat page. */
// Carousel = <ScrollRow> (chevron gutters, hidden scrollbar, wheel/touch still work) + CSS
// scroll-snap on the rail. Inside a `@container/cards`: slides are ~3/4 of a narrow column
// (widget / Ask Aly popover) so the next card peeks and invites the swipe; fixed 260px once the
// column is wide. py-1 leaves room for the card's hover lift.
const CARD_RAIL = "flex snap-x snap-mandatory gap-2.5 py-1 @min-[30rem]/cards:gap-3";
const CARD_SLIDE = "w-[72%] shrink-0 snap-start @min-[30rem]/cards:w-[260px]";
/** One card: half the row while narrow, so it matches a pair; capped at 300px when wide. */
const SINGLE_CARD = "grid w-full grid-cols-2 gap-2.5 @min-[30rem]/cards:block @min-[30rem]/cards:max-w-[300px]";

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

function ReplyButton({ target }: { target: { role: Message["role"]; content: string } }) {
  const dispatch = useAppDispatch();

  return (
    <Button
      variant="ghost"
      size="icon-xs"
      onClick={() => dispatch(setReplyTo(target))}
      aria-label="Reply to this message"
    >
      <CornerUpLeft />
    </Button>
  );
}

/** Row under a turn holding its copy/reply/feedback controls. */
function MessageActions({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-0.5 text-muted-foreground opacity-70 transition-opacity hover:opacity-100">
      {children}
    </div>
  );
}

/** The quote a reply carries, rendered as a strip instead of a literal "> " line. */
function QuotedText({ text }: { text: string }) {
  return (
    <p className="mb-1.5 border-l-2 border-primary/40 pl-2 text-xs text-muted-foreground line-clamp-3">
      {text}
    </p>
  );
}

/** Small brand mark in the gutter, so a bubbleless assistant turn still reads as "not you".
 * Hidden on the narrowest containers, where the column can't spare 40px. */
function AssistantMark() {
  return (
    <span className="mt-0.5 hidden size-7 shrink-0 items-center justify-center sm:flex">
      <AlyOrbIcon className="size-7" />
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

/** Follow-up suggestions. One tap sends — picking several and pressing a second Send button was
 *  two clicks for what reads as one choice, and nobody expects a suggestion chip to need confirming.
 *
 *  A tap marks the chip, it does NOT retire the row: `if (sent) return` used to kill every chip in
 *  the turn for the rest of the session, so the second suggestion the student wanted was simply
 *  dead, and scrolling back to an earlier turn's chips got nothing. Suggestions are re-askable by
 *  nature. The only thing that refuses a tap is a reply already streaming, and `busy` greys the row
 *  while that is true — the refusal used to be silent, which is what made chips feel like they
 *  needed two or three clicks. */
function Chips({ chips, onChipClick, busy }: { chips: string[]; onChipClick?: (chip: string) => boolean | void; busy?: boolean }) {
  const [sent, setSent] = useState<string | null>(null);

  const send = (chip: string) => {
    if (onChipClick?.(chip) === false) return; // refused mid-stream: leave every chip tappable
    setSent(chip);
  };

  return (
    <div className="flex flex-col gap-2.5 pt-1">
      <div className="flex flex-wrap gap-1.5">
        {chips.map((chip, i) => {
          const active = sent === chip;
          return (
            // Same arriving treatment as the option rows: the wrapper fades each suggestion in,
            // staggered, and the chip itself breathes while the reply streams. Greying them out
            // read as "blocked" when the truth is "not yet" — see QuickRepliesBlock.
            <span
              key={chip}
              className={cn("inline-flex", busy && "animate-in fade-in slide-in-from-bottom-1 duration-300")}
              style={busy ? { animationDelay: `${i * 90}ms`, animationFillMode: "backwards" } : undefined}
            >
              <button
                type="button"
                disabled={busy}
                onClick={() => send(chip)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-150",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                  "active:scale-[0.96]",
                  active
                    ? "border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/30 scale-[1.02]"
                    : "border-border/70 bg-muted/50 text-muted-foreground hover:border-primary/50 hover:bg-primary/8 hover:text-foreground hover:shadow-sm",
                  busy && "cursor-progress motion-safe:animate-pulse",
                )}
              >
                {chip}
              </button>
            </span>
          );
        })}
      </div>
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
  onSend,
  busy,
  footer,
}: {
  content: string;
  cards: CourseCardType[];
  chips: string[];
  blocks: ResponseBlock[];
  onChipClick?: (chip: string) => boolean | void;
  onSend?: (value: string) => boolean | void;
  /** A reply is streaming: every tappable row refuses, so grey them rather than swallow the tap. */
  busy?: boolean;
  footer?: React.ReactNode;
}) {
  // A question-only turn (the widget's level and stream steps) shows its options and nothing else;
  // a turn with cards keeps its follow-ups. See followUpChips.
  const visibleChips = followUpChips(chips, blocks, cards.length > 0);

  return (
    <div className="flex w-full gap-3">
      <AssistantMark />
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {content && <MessageMarkdown text={content} />}
        {blocks.length > 0 && <MessageBlocks blocks={blocks} onAction={onChipClick} onSend={onSend} busy={busy} />}
        {cards.length > 0 && (
          // The container is the chat column, not the screen: slide width follows the column.
          <div className="@container/cards w-full">
            {/* One card is not a carousel — no rail, no chevron gutters. */}
            {cards.length === 1 && cards[0] ? (
              <div className={SINGLE_CARD}>
                <CourseCard card={cards[0]} />
              </div>
            ) : (
              <ScrollRow rowClassName={CARD_RAIL}>
                {cards.map((card, i) => (
                  <div key={card.id ?? i} className={CARD_SLIDE}>
                    <CourseCard card={card} />
                  </div>
                ))}
              </ScrollRow>
            )}
          </div>
        )}
        {visibleChips.length > 0 && <Chips chips={visibleChips} onChipClick={onChipClick} busy={busy} />}
        {footer}
      </div>
    </div>
  );
}

export function ChatMessage({ message, onChipClick, onSend, busy }: ChatMessageProps) {
  if (message.role === "user") {
    const { quote, body } = splitQuote(message.content);
    return (
      <div className="flex flex-col items-end gap-1.5">
        <div className="max-w-[85%] rounded-xl rounded-br-sm bg-primary/10 px-4 py-2.5">
          {quote && <QuotedText text={quote} />}
          {/* select-text so the prompt can be selected and copied by hand, not just via the button */}
          <p className="text-[0.9375rem] leading-relaxed whitespace-pre-wrap select-text text-foreground">
            {body}
          </p>
        </div>
        {!!message.attachments?.length && <Attachments paths={message.attachments} />}
        <MessageActions>
          <CopyButton text={body} />
          <ReplyButton target={{ role: "user", content: body }} />
        </MessageActions>
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
      onSend={onSend}
      busy={busy}
      footer={
        // Optimistic rows have no server id yet, so there's nothing to rate.
        message.id > 0 ? (
          <MessageActions>
            <CopyButton text={message.content} />
            <ReplyButton target={{ role: "assistant", content: message.content }} />
            <FeedbackButtons messageId={message.id} feedback={message.feedback} />
          </MessageActions>
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
  onSend,
}: {
  content: string;
  cards: CourseCardType[];
  chips: string[];
  blocks?: ResponseBlock[];
  onChipClick?: (chip: string) => boolean | void;
  onSend?: (value: string) => boolean | void;
}) {
  // Always busy: this IS the reply still streaming, so its own rows cannot be answered yet.
  return (
    <AssistantTurn content={content} cards={cards} chips={chips} blocks={blocks} onChipClick={onChipClick} onSend={onSend} busy />
  );
}
