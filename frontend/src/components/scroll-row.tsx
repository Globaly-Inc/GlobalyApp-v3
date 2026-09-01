"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Horizontal rail that hides its scrollbar and puts chevrons on the edges instead, so a row of
 * chips/cards/tabs never plants a scrollbar in the middle of a page. Scrollbars belong to the page
 * or to a dropdown's option list, not to a row inside a card.
 *
 * Each chevron only appears when there is something to scroll to in that direction. Wheel, trackpad
 * and touch scrolling still work, so the arrows are an affordance, not the only way through.
 */
export function ScrollRow({
  className, rowClassName, children,
}: Readonly<{ className?: string; rowClassName?: string; children: ReactNode }>) {
  const ref = useRef<HTMLDivElement>(null);
  const [ends, setEnds] = useState({ left: false, right: false });

  const sync = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEnds((prev) => {
      const next = { left: el.scrollLeft > 1, right: el.scrollLeft < max - 1 };
      return prev.left === next.left && prev.right === next.right ? prev : next;
    });
  }, []);

  // ponytail: no dep array — re-measures after every render, which covers children being added or
  // filtered. ResizeObserver on the rail covers viewport/container resizes.
  useEffect(sync);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [sync]);

  const nudge = (dir: -1 | 1) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  };

  // ponytail: the chevrons sit in their own grid gutters, not on top of the row, so they never cover a
  // card. The gutters keep their width when a chevron is hidden — `invisible`, not unmounted — so
  // reaching an end doesn't shift the row sideways.
  const arrowClass =
    "flex shrink-0 items-center self-stretch rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

  return (
    <div className={cn("flex items-stretch gap-0.5", className)}>
      <button
        type="button"
        aria-label="Scroll left"
        aria-hidden={!ends.left}
        tabIndex={ends.left ? 0 : -1}
        onClick={() => nudge(-1)}
        className={cn(arrowClass, !ends.left && "invisible")}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <div ref={ref} onScroll={sync} className={cn("min-w-0 flex-1 overflow-x-auto scrollbar-none", rowClassName)}>
        {children}
      </div>
      <button
        type="button"
        aria-label="Scroll right"
        aria-hidden={!ends.right}
        tabIndex={ends.right ? 0 : -1}
        onClick={() => nudge(1)}
        className={cn(arrowClass, !ends.right && "invisible")}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
