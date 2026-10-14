"use client";

import { useState } from "react";
import { Check, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ResponseBlock } from "../../apis/types";

type QuickRepliesBlockProps = {
  block: Extract<ResponseBlock, { type: "quick_replies" }>;
  /** Sends the tapped answer. There is deliberately no draft-change callback: a tap IS the reply,
   *  which is also what the prompt promises the model ("the tapped value is sent as their reply").
   *  Handing out a draft callback as well meant the widget fired a turn on each keystroke.
   *  Returns false when the send was refused (another answer still streaming) — nothing was sent. */
  onSend?: (value: string) => boolean | void;
  /** A reply is still streaming, so a tap would be refused. The options then read as ARRIVING —
   *  each one fades up in turn and the row breathes — rather than as a list that has been blocked:
   *  a greyed-out row says "you may not", and the truth is "not yet". */
  busy?: boolean;
};

/**
 * Tappable answer options for a question the counsellor asked. One tap sends — the student who
 * wants to say something else types in the composer below the thread, not in a second input here.
 *
 * A column of full-width rows, not a wrap of pills: these carry the widget's intake steps now
 * (study level, then subject stream), where the labels are long enough that pills wrapped into an
 * unreadable blob in a 380px panel and gave every option a different-sized tap target. One row
 * each reads top-to-bottom, holds "Business and Management" without truncating, and is a
 * thumb-sized target on a phone.
 */
export function QuickRepliesBlock({ block, onSend, busy }: QuickRepliesBlockProps) {
  const [sent, setSent] = useState<string | null>(null);

  // A tap marks the option; it does not retire the block. `if (sent) return` used to lock every
  // option in the turn forever, so a student who changed their mind — or scrolled back to an
  // earlier question — tapped a dead row. Only an in-flight reply refuses, and `busy` shows it.
  const send = (value: string) => {
    if (onSend?.(value) === false) return; // refused mid-stream: leave every option tappable
    setSent(value);
  };

  return (
    <div className="w-full space-y-2">
      {block.question && <p className="text-sm font-medium text-foreground">{block.question}</p>}
      <div className="flex flex-col gap-1.5">
        {block.options.map((option, i) => {
          const chosen = sent === option.value;
          return (
            // Two animations, two elements: the wrapper fades the row up into place (staggered by
            // position, so while the reply streams the list builds downwards at ~90ms a row), the
            // button breathes until the reply ends. One element cannot run both — `animation` is a
            // single shorthand, so the second utility would simply replace the first.
            <div
              key={option.label}
              className={busy ? "animate-in fade-in slide-in-from-bottom-1 duration-300" : undefined}
              style={busy ? { animationDelay: `${i * 90}ms`, animationFillMode: "backwards" } : undefined}
            >
              <button
                type="button"
                disabled={busy}
                onClick={() => send(option.value)}
                className={cn(
                  "group flex w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5",
                  "text-left text-sm font-medium transition-all duration-150",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                  chosen
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-card text-foreground hover:border-primary/50 hover:bg-accent active:scale-[0.99]",
                  // Once one is tapped the rest stay readable rather than greying out to nothing —
                  // the student can still see what they passed over, and can still change to one.
                  sent !== null && !chosen && "opacity-70",
                  // Arriving, not barred. No grey-out: a dimmed row says "you may not", and the
                  // truth is "not yet".
                  busy && "cursor-progress motion-safe:animate-pulse",
                )}
              >
                <span className="min-w-0">{option.label}</span>
                {chosen ? (
                  <Check className="size-4 shrink-0 text-primary" />
                ) : (
                  <ChevronRight
                    className={cn(
                      "size-4 shrink-0 transition-transform",
                      busy
                        ? "text-muted-foreground/50"
                        : "text-muted-foreground group-hover:translate-x-0.5 group-hover:text-primary",
                    )}
                  />
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
