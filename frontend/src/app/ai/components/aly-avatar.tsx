"use client";

import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

// ponytail: character layer — swap inner content when animated asset arrives.
// State prop is wired now so callers need no changes when animation lands.
export type AlyState = "idle" | "thinking" | "responding" | "listening";

type AlyAvatarProps = {
  state?: AlyState;
  className?: string;
};

/** Aly's visual identity mark — appears in the message gutter and thinking indicator.
 *  Replace the inner <Sparkles> with an animated character asset when available. */
export function AlyAvatar({ state = "idle", className }: AlyAvatarProps) {
  return (
    <span
      className={cn(
        "mt-0.5 hidden size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary sm:flex",
        className,
      )}
    >
      <Sparkles className={cn("size-3.5", state === "thinking" && "animate-pulse")} />
    </span>
  );
}

export const ALY_NAME = "Aly";
