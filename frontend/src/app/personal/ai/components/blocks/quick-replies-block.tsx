"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ResponseBlock } from "../../apis/types";

type QuickRepliesBlockProps = {
  block: Extract<ResponseBlock, { type: "quick_replies" }>;
  /** Tapping an option or submitting the custom field sends its value as the user's next message. */
  onAction?: (value: string) => void;
};

/** Tappable answer options for a question the counsellor asked, plus a free-text fallback. */
export function QuickRepliesBlock({ block, onAction }: QuickRepliesBlockProps) {
  const [custom, setCustom] = useState("");

  const submitCustom = () => {
    const val = custom.trim();
    if (!val) return;
    onAction?.(val);
    setCustom("");
  };

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
      <div className="mt-2 flex gap-2">
        <Input
          placeholder="Or type your own answer…"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submitCustom()}
          className="h-8 text-xs"
        />
        <Button size="sm" variant="outline" disabled={!custom.trim()} onClick={submitCustom}>
          Send
        </Button>
      </div>
    </div>
  );
}
