"use client";

import type { ComponentType } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Summary-tab card for a child resource: icon tile, title, count pill, a visibility pill (or any
 * `badge`), and a "Manage" link to its tab. Body: `children` (a preview of real items), or a dashed
 * empty state with an Add button while `count` is 0. Leave `emptyText` out to always show children. */
export function SectionSummaryCard({
  icon: Icon,
  title,
  count,
  badge,
  action,
  emptyText,
  emptyHint,
  addLabel = "Add",
  onAdd,
  children,
}: Readonly<{
  icon: ComponentType<{ className?: string }>;
  title: string;
  count?: number;
  badge?: React.ReactNode;
  /** Replaces the "Manage" link in the header (e.g. the media card's edit toggle). */
  action?: React.ReactNode;
  emptyText?: string;
  emptyHint?: string;
  addLabel?: string;
  /** Jump to this section's tab — powers both "Manage" and the empty state's Add button. */
  onAdd?: () => void;
  children?: React.ReactNode;
}>) {
  const empty = emptyText != null && count === 0;
  const manage = action ?? (onAdd && !empty && (
    <button type="button" onClick={onAdd} className="rounded-md px-1.5 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary">
      Manage
    </button>
  ));

  let body: React.ReactNode = children;
  if (empty) {
    body = (
      <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center">
        <p className="text-sm font-semibold">{emptyText}</p>
        {emptyHint && <p className="max-w-xs text-xs text-muted-foreground">{emptyHint}</p>}
        {onAdd && (
          <Button size="sm" onClick={onAdd} className="group/add mt-1 gap-1.5">
            <Plus className="h-3.5 w-3.5 transition-transform duration-300 group-hover/add:rotate-90" />
            {addLabel}
          </Button>
        )}
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border bg-card text-card-foreground transition-[box-shadow,border-color,transform] duration-300 hover:-translate-y-px hover:border-primary/20 hover:shadow-md">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3.5">
        <h2 className="flex items-center gap-2 font-sans text-sm font-bold tracking-normal">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-3.5" />
          </span>
          {title}
          {count != null && count > 0 && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[11px] tabular-nums text-primary">{count}</span>
          )}
        </h2>
        <div className="flex items-center gap-2">
          {badge}
          {manage}
        </div>
      </header>
      {body != null && body !== false && <div className="px-4 py-3.5">{body}</div>}
    </section>
  );
}

