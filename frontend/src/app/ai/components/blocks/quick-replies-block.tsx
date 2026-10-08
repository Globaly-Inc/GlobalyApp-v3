"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ResponseBlock } from "../../apis/types";

type QuickRepliesBlockProps = {
  block: Extract<ResponseBlock, { type: "quick_replies" }>;
  /** Sends the tapped answer. There is deliberately no draft-change callback: a tap IS the reply,
   *  which is also what the prompt promises the model ("the tapped value is sent as their reply").
   *  Handing out a draft callback as well meant the widget fired a turn on each keystroke.
   *  Returns false when the send was refused (another answer still streaming) — nothing was sent. */
  onSend?: (value: string) => boolean | void;
};

/** Tappable answer options for a question the counsellor asked. One tap sends — the student who
 *  wants to say something else types in the composer below the thread, not in a second input here. */
export function QuickRepliesBlock({ block, onSend }: QuickRepliesBlockProps) {
  const [sent, setSent] = useState<string | null>(null);

  const send = (value: string) => {
    if (sent) return; // a second tap would fire a second turn
    if (onSend?.(value) === false) return; // refused mid-stream: leave every option tappable
    setSent(value);
  };

  return (
    <div className="w-full max-w-[85%] space-y-2">
      {block.question && <p className="text-xs font-medium text-muted-foreground">{block.question}</p>}
      <div className="flex flex-wrap gap-1.5">
        {block.options.map((option) => (
          <Button
            key={option.label}
            variant={sent === option.value ? "default" : "secondary"}
            size="sm"
            className="rounded-full"
            disabled={sent !== null && sent !== option.value}
            onClick={() => send(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
