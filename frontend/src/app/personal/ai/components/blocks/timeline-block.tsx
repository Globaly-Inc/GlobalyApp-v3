"use client";

import type { ResponseBlock } from "../../apis/types";

type TimelineBlockProps = {
  block: Extract<ResponseBlock, { type: "timeline" }>;
};

/** Vertical roadmap — career paths, study journeys, application timelines. */
export function TimelineBlock({ block }: TimelineBlockProps) {
  return (
    <div className="w-full rounded-xl border bg-card p-4 shadow-xs">
      {block.title && <p className="mb-3 text-sm font-semibold">{block.title}</p>}
      <ol className="relative ml-2 border-l-2 border-primary/20">
        {block.steps.map((step, i) => (
          <li key={i} className="relative pb-4 pl-5 last:pb-0">
            <span className="absolute -left-[9px] top-0.5 flex size-4 items-center justify-center rounded-full border-2 border-primary bg-background">
              <span className="size-1.5 rounded-full bg-primary" />
            </span>
            <p className="text-sm font-medium leading-tight">{step.title}</p>
            {step.description && (
              <p className="mt-0.5 text-xs text-muted-foreground">{step.description}</p>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
