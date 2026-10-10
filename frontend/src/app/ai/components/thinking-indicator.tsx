"use client";

import { Sparkles } from "lucide-react";

import { thinkingPhase } from "../utils";

type ThinkingIndicatorProps = {
  steps: string[];
};

export function ThinkingIndicator({ steps }: ThinkingIndicatorProps) {
  const latest = thinkingPhase(steps.at(-1));

  // Bubbleless, matching the assistant turn it precedes — the gutter mark keeps it
  // aligned with the prose that replaces it once the first token lands.
  return (
    <div className="flex w-full gap-3">
      <span className="mt-0.5 hidden size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary sm:flex">
        <Sparkles className="size-3.5 animate-pulse" />
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-2 pt-1 text-sm text-muted-foreground">
        <span className="inline-flex gap-1">
          {[0, 150, 300].map((delay) => (
            <span
              key={delay}
              className="size-1.5 animate-bounce rounded-full bg-primary/60"
              style={{ animationDelay: `${delay}ms` }}
            />
          ))}
        </span>
        <span className="animate-pulse">{latest}...</span>
      </div>
    </div>
  );
}
