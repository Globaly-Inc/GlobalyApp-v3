"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Width of one rendered copy of the row, gap included. */
function copyWidth(el: HTMLElement, copies: number) {
  return (el.scrollWidth + (parseFloat(getComputedStyle(el).columnGap) || 0)) / copies;
}

/**
 * Horizontal card rail that drifts on its own and hides its scrollbar, so a row of cards reads as a
 * carousel without the native scrollbar sitting under it. Children are rendered in as many copies
 * as the rail needs so the drift loops endlessly in one direction. Still hand-scrollable; the drift pauses while the pointer or
 * focus is inside, and never starts when the OS asks for reduced motion.
 */
export function AutoScrollRow({ className, children }: Readonly<{ className?: string; children: ReactNode }>) {
  const ref = useRef<HTMLDivElement>(null);
  const [copies, setCopies] = useState(2);

  // The loop wraps by exactly one copy width, so the rail needs a whole copy of slack past what it
  // shows. A row with only a few cards gets extra copies rather than sitting still.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const one = copyWidth(el, copies);
    if (!one) return;
    const needed = Math.max(2, Math.ceil(el.clientWidth / one) + 1);
    if (needed !== copies) setCopies(needed);
  }, [copies, children]);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let paused = false;
    const pause = () => (paused = true);
    const resume = () => (paused = false);

    // ponytail: 1px per 30ms ≈ 33px/s over identical copies of the row. Scrolling forwards drifts
    // the cards right→left; at one copy width it jumps back by that width, which lands on
    // pixel-identical content so the seam is invisible.
    // Swap for rAF only if the drift ever needs to be smoother than a pixel a frame-ish.
    const id = setInterval(() => {
      if (paused) return;
      const one = copyWidth(el, copies);
      if (!one) return;
      const next = el.scrollLeft + 1;
      el.scrollLeft = next >= one ? next - one : next;
    }, 30);

    el.addEventListener("mouseenter", pause);
    el.addEventListener("mouseleave", resume);
    el.addEventListener("touchstart", pause, { passive: true });
    el.addEventListener("touchend", resume, { passive: true });
    el.addEventListener("focusin", pause);
    el.addEventListener("focusout", resume);
    return () => {
      clearInterval(id);
      el.removeEventListener("mouseenter", pause);
      el.removeEventListener("mouseleave", resume);
      el.removeEventListener("touchstart", pause);
      el.removeEventListener("touchend", resume);
      el.removeEventListener("focusin", pause);
      el.removeEventListener("focusout", resume);
    };
  }, [copies]);

  // ponytail: overflow-y-hidden because the cards animate in with translateY(32px), which otherwise
  // leaves the rail vertically scrollable and lets a card get scrolled half out of view. py-2 keeps
  // hover shadows off the clip edge.
  return (
    <div ref={ref} className={cn("overflow-x-auto overflow-y-hidden scrollbar-none py-2", className)}>
      {/* Copies past the first are what the loop scrolls into; inert keeps them out of the tab order. */}
      {Array.from({ length: copies }).map((_, i) => (
        <div key={i} className="contents" aria-hidden={i > 0} inert={i > 0}>
          {children}
        </div>
      ))}
    </div>
  );
}
