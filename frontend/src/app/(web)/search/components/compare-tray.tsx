"use client";

import Link from "next/link";
import { X, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCompareTray } from "../use-compare-tray";

export function CompareTray() {
  const { items, max, remove, clear } = useCompareTray();
  if (items.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 max-w-[calc(100%-2rem)]">
      <div className="flex items-center gap-2 rounded-full border border-border bg-card shadow-lg px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
          Compare ({items.length}/{max})
        </span>
        <div className="flex gap-1 overflow-x-auto">
          {items.map((i) => (
            <span key={i.id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] max-w-[140px]">
              <span className="truncate">{i.name}</span>
              <button type="button" onClick={() => remove(i.id)} aria-label={`Remove ${i.name}`}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <Link href="/compare">
          <Button size="sm" disabled={items.length < 2} className="h-7 text-xs gap-1">
            <Layers className="h-3 w-3" />Compare Now
          </Button>
        </Link>
        <Button type="button" size="sm" variant="ghost" onClick={clear} className="h-7 text-xs">Clear all</Button>
      </div>
    </div>
  );
}
