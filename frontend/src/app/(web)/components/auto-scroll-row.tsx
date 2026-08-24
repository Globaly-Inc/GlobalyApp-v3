"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Horizontal card rail that drifts on its own and hides its scrollbar, so a row of cards reads as a
 * carousel without the native scrollbar sitting under it. Still hand-scrollable; the drift pauses
 * while the pointer or focus is inside, and never starts when the OS asks for reduced motion.
 */
export function AutoScrollRow({ className, children }: Readonly<{ className?: string; children: ReactNode }>) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let paused = false;
    let step = 1;
    const pause = () => (paused = true);
    const resume = () => (paused = false);

    // ponytail: 1px per 30ms ≈ 33px/s, and it ping-pongs at the ends rather than snapping back to 0.
    // Swap for rAF only if the drift ever needs to be smoother than a pixel a frame-ish.
    const id = setInterval(() => {
      const end = el.scrollWidth - el.clientWidth;
      if (paused || end <= 0) return;
      if (el.scrollLeft >= end - 1) step = -1;
      if (el.scrollLeft <= 0) step = 1;
      el.scrollLeft += step;
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
  }, []);

  return (
    <div ref={ref} className={cn("overflow-x-auto scrollbar-none", className)}>
      {children}
    </div>
  );
}
