"use client";

import { Button } from "@/components/ui/button";
import type { ResponseBlock } from "../../apis/types";

type QuickRepliesBlockProps = {
  block: Extract<ResponseBlock, { type: "quick_replies" }>;
  /** Tapping an option sends its value as the user's next message. */
  onAction?: (value: string) => void;
};

/** Tappable answer options for a question the counsellor asked. */
export function QuickRepliesBlock({ block, onAction }: QuickRepliesBlockProps) {
  return (
    <div className="w-full max-w-[85%]">
      {block.question && <p className="mb-1.5 text-xs font-medium text-muted-foreground">{block.question}</p>}
      <div className="flex flex-wrap gap-1.5">
        {block.options.map((option) => (
          <Button
            key={option.label}
            variant="secondary"
            size="sm"
            className="rounded-full"
            onClick={() => onAction?.(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
