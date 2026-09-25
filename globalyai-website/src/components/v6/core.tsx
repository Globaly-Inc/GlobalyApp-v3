"use client";

import { Brain } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The thing the questions arrive at: a brain, thinking.
 *
 * This was generated footage of a sphere of light for a while, on the grounds
 * that a brain glyph is the templated way to draw "there is an AI in here".
 * It went back to the brain on request (23 Sep 2026): the sphere was pretty
 * but did not say "it thinks", and the brain does at a glance. What keeps it
 * from being a stock icon in a ring is that it is visibly working: two arcs
 * circle it without stopping, and every question that arrives makes it flare,
 * throw a ripple and pulse. See "The core thinking" in globals.css.
 *
 * The coreLight/coreDark clips in MOTION are no longer used here, and stay
 * there in case the footage comes back.
 */
export function LearningCore({
  className,
  lit = false,
  pulse = 0,
}: Readonly<{
  className?: string;
  lit?: boolean;
  /** Bumped once per question taken in; each new value fires one flare, ripple and pulse. */
  pulse?: number;
}>) {
  return (
    <div className={cn("relative aspect-square w-full max-w-[17rem]", className)} aria-hidden="true">
      <span
        className={cn(
          "v6-core-glow absolute inset-[-18%] rounded-full transition-opacity duration-500",
          lit ? "opacity-100" : "opacity-70",
        )}
      />

      {/* Thinking: two arcs circling the ring in opposite directions, always. */}
      <span className="v6-core-orbit absolute inset-[-3%] rounded-full" />
      <span className="v6-core-orbit v6-core-orbit-slow absolute inset-[-10%] rounded-full" />

      {/* One question taken in. Keyed on the pulse so each arrival is a fresh
          element and the animation replays; timed to land with the spark. */}
      {pulse > 0 && (
        <span key={pulse} className="pointer-events-none absolute inset-0">
          <span className="v6-core-flare absolute inset-[-12%] rounded-full" />
          <span className="v6-core-ripple absolute inset-0 rounded-full" />
        </span>
      )}

      <span
        className={cn(
          "absolute inset-0 rounded-full border transition-colors duration-300",
          lit ? "border-[var(--primary-bright)]" : "border-[var(--border-strong)]",
        )}
      />

      <div className="v6-brain-well absolute inset-[8%] flex items-center justify-center rounded-full border border-[var(--border)]">
        <Brain
          key={pulse}
          strokeWidth={1.25}
          className={cn(
            "v6-brain h-[46%] w-[46%] text-[var(--primary-bright)] transition-[filter] duration-500",
            pulse > 0 && "v6-brain-pulse",
            lit && "v6-brain-lit",
          )}
        />
      </div>
    </div>
  );
}
