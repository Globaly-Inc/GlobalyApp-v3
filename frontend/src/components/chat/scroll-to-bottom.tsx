"use client";

import { ArrowDown } from "lucide-react";

/**
 * The floating "Jump to bottom" pill, from GlobalyOS V2's `ScrollToBottom` — same
 * neutral-surface variant, same primary-tinted arrow, same one-shot entrance.
 *
 * V2's second (unread-count) variant is omitted: the student thread marks itself read on
 * open, so there is never a live unread count to show while scrolled away.
 */
export function ScrollToBottom({ visible, onClick }: Readonly<{ visible: boolean; onClick: () => void }>) {
  if (!visible) return null;

  return (
    <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 animate-in fade-in slide-in-from-bottom-2 duration-200">
      <button
        type="button"
        onClick={onClick}
        aria-label="Jump to bottom"
        className="group inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground shadow-md outline-none transition-all duration-200 hover:bg-accent focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <ArrowDown className="size-4 text-primary transition-transform duration-200 group-hover:translate-y-0.5" />
        Jump to bottom
      </button>
    </div>
  );
}
