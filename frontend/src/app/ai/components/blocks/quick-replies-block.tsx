"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ResponseBlock } from "../../apis/types";

type QuickRepliesBlockProps = {
  block: Extract<ResponseBlock, { type: "quick_replies" }>;
  onAction?: (value: string) => void;
};

/** Tappable answer options for a question the counsellor asked. Multi-select populates the input below. */
export function QuickRepliesBlock({ block, onAction }: QuickRepliesBlockProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [text, setText] = useState("");

  const toggle = (value: string) => {
    const next = selected.includes(value)
      ? selected.filter((v) => v !== value)
      : [...selected, value];
    setSelected(next);
    const composed =
      next.length === 0 ? "" : next.length === 1 ? next[0]! : next.map((v) => `• ${v}`).join("\n");
    setText(composed);
    onAction?.(composed);
  };

  const handleTextChange = (value: string) => {
    setText(value);
    setSelected([]);
    onAction?.(value);
  };

  return (
    <div className="w-full max-w-[85%] space-y-2">
      {block.question && <p className="text-xs font-medium text-muted-foreground">{block.question}</p>}
      <div className="flex flex-wrap gap-1.5">
        {block.options.map((option) => (
          <Button
            key={option.label}
            variant={selected.includes(option.value) ? "default" : "secondary"}
            size="sm"
            className="rounded-full"
            onClick={() => toggle(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
      <Textarea
        value={text}
        onChange={(e) => handleTextChange(e.target.value)}
        placeholder="Type your answer or select from above…"
        rows={2}
        className="resize-none text-sm"
      />
    </div>
  );
}
