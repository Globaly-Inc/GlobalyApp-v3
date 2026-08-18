"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, Layers, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCompareTray } from "../use-compare-tray";

/**
 * Floating messenger-style compare widget (bottom-right, collapsible).
 * Shared by the search page and the AI counsellor — both feed the same
 * in-memory store, and "Compare Now" opens /compare in the SAME tab
 * (a new tab would start with an empty store).
 */
export function CompareTray() {
  const { items, max, remove, clear } = useCompareTray();
  const [collapsed, setCollapsed] = useState(false);

  if (items.length === 0) return null;

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        aria-label={`Open compare list (${items.length} courses)`}
        className="fixed bottom-4 right-4 z-40 flex size-12 cursor-pointer items-center justify-center rounded-full border border-border bg-card shadow-lg transition-transform hover:scale-105"
      >
        <Layers className="size-5 text-primary" />
        <span className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
          {items.length}
        </span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-card shadow-xl">
      <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <Layers className="size-4 text-primary" /> Compare courses ({items.length}/{max})
        </span>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          aria-label="Collapse compare list"
          className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ChevronDown className="size-4" />
        </button>
      </div>

      <ul className="max-h-56 overflow-y-auto">
        {items.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-2 border-b px-3 py-2 last:border-b-0">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium" title={i.name}>{i.name}</p>
              {i.institutionName && (
                <p className="truncate text-[11px] text-muted-foreground">{i.institutionName}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => remove(i.id)}
              aria-label={`Remove ${i.name}`}
              className="cursor-pointer rounded p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
        {items.length < 2 ? (
          <Button size="sm" disabled className="h-8 flex-1 gap-1.5">
            <Layers className="size-3.5" /> Compare Now
          </Button>
        ) : (
          <Button size="sm" className="h-8 flex-1 gap-1.5" render={<Link href="/compare" />}>
            <Layers className="size-3.5" /> Compare Now
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" onClick={clear} className="h-8">
          Clear
        </Button>
      </div>
    </div>
  );
}
