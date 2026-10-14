"use client";

import type { ComponentType } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Shared frame for the service detail tabs: header (icon tile, title, count, Add button),
 * an optional summary strip, then the items — or a skeleton while loading, or a dashed empty
 * state with its own Add button. Children are expected to stagger in (`stagger-in`). */
export function TabSection({
  icon: Icon,
  title,
  count,
  addLabel,
  onAdd,
  loading,
  emptyTitle,
  emptyHint,
  summary,
  children,
}: Readonly<{
  icon: ComponentType<{ className?: string }>;
  title: string;
  count: number;
  addLabel: string;
  onAdd?: () => void;
  loading: boolean;
  emptyTitle: string;
  emptyHint?: string;
  /** Leading figure for the tab (total cost, next deadline, credits…), shown when there are items. */
  summary?: React.ReactNode;
  children: React.ReactNode;
}>) {
  const addButton = onAdd && (
    <Button
      size="sm"
      onClick={onAdd}
      aria-label={`${addLabel}`}
      className="group/add gap-1.5 transition-[transform,box-shadow] hover:-translate-y-px hover:shadow-[0_6px_18px_-6px_var(--color-primary)] active:translate-y-0 active:scale-[.98]"
    >
      <Plus className="h-3.5 w-3.5 transition-transform duration-300 ease-[cubic-bezier(.34,1.56,.64,1)] group-hover/add:rotate-90" />
      {addLabel}
    </Button>
  );

  let body: React.ReactNode;
  if (loading) {
    body = (
      <div className="flex flex-col gap-2" aria-busy="true" aria-label={`Loading ${title.toLowerCase()}`}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" style={{ animationDelay: `${i * 100}ms` }} />
        ))}
      </div>
    );
  } else if (count === 0) {
    body = (
      <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-10 text-center">
        <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        <p className="text-sm font-semibold">{emptyTitle}</p>
        {emptyHint && <p className="max-w-sm text-xs text-muted-foreground">{emptyHint}</p>}
        {addButton && <div className="mt-1">{addButton}</div>}
      </div>
    );
  } else {
    body = (
      <div className="stagger-in flex flex-col gap-3">
        {summary}
        {children}
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2.5 font-sans text-base font-bold tracking-normal">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-4" />
          </span>
          {title}
          {count > 0 && <span className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-xs tabular-nums text-primary">{count}</span>}
        </h2>
        {count > 0 && addButton}
      </div>
      {body}
    </section>
  );
}
