"use client";

import { cn } from "@/lib/utils";
import { KNOWLEDGE_TABS } from "../const";
import type { KnowledgeTab } from "../types";

/**
 * The page's four sections, with the work each one holds visible on the tab itself.
 *
 * The segmented control this replaces showed four equal labels, so "three suggestions are waiting
 * for you" was a fact you could only learn by clicking. A count on the tab is the whole point:
 * the nav stops being a way to move around and starts being the to-do list.
 *
 * Counts render only when non-zero. A row of grey "0" badges is noise that trains people to stop
 * reading the badges, which costs more than the zeros convey.
 */
export function KnowledgeNav({
  value, onChange, counts,
}: Readonly<{
  value: KnowledgeTab;
  onChange: (tab: KnowledgeTab) => void;
  counts: Partial<Record<KnowledgeTab, number>>;
}>) {
  return (
    // Scrolls rather than wraps: four labels this long wrap to two rows on a phone, and a nav
    // that changes height when you select a tab feels broken. `-mx-1 px-1` keeps the focus ring
    // of the first and last tab from being clipped by the scroll container.
    <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" aria-label="AI knowledge sections">
      {KNOWLEDGE_TABS.map((tab) => {
        const selected = value === tab.value;
        const count = counts[tab.value] ?? 0;
        return (
          <button
            key={tab.value}
            type="button"
            onClick={() => onChange(tab.value)}
            aria-current={selected ? "page" : undefined}
            className={cn(
              "relative flex shrink-0 cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              selected
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {tab.label}
            {count > 0 && (
              <span
                className={cn(
                  "grid min-w-5 place-items-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
                  // On the selected tab the badge sits on the primary fill, where a tinted
                  // background would disappear — so it borrows the tab's own foreground at low
                  // opacity instead of carrying a colour of its own.
                  selected ? "bg-white/20 text-primary-foreground" : "bg-primary/10 text-primary",
                )}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
