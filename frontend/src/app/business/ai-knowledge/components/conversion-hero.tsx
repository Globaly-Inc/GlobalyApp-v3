"use client";

import { cn } from "@/lib/utils";

/**
 * The one figure this tab exists to report: how many finished conversations left a lead.
 *
 * It used to be the second of four identical tiles, which gave "Conversations", "Became leads"
 * and "Messages to a lead" the same visual weight — three equal numbers is a table, and a table
 * makes the reader do the ranking. The rate is the answer; everything else is how it was reached.
 *
 * No donut, no gauge. A part-of-whole with exactly two parts is a bar, and a bar can be read to
 * the percentage point where an arc can't.
 */
export function ConversionHero({
  conversations, converted, messages, duration,
}: Readonly<{
  conversations: number;
  converted: number;
  messages: number | null;
  duration: string;
}>) {
  const rate = conversations > 0 ? Math.round((converted / conversations) * 100) : 0;

  return (
    <section className="rounded-xl border bg-card p-5 sm:p-6">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Conversations that became leads
          </p>
          {/* Lining the baselines up: the percent sign and the ratio are set smaller but share
              the number's baseline, so the eye reads one figure rather than three things. */}
          <p className="mt-1 flex items-baseline gap-2">
            <span className="text-5xl font-semibold tabular-nums tracking-tight">{rate}</span>
            <span className="text-2xl font-semibold text-muted-foreground">%</span>
            <span className="text-sm text-muted-foreground">
              {converted} of {conversations}
            </span>
          </p>
        </div>

        <div className="flex gap-6 sm:gap-8">
          <Secondary
            label="Messages to a lead"
            value={messages == null ? "—" : String(messages)}
            hint="Typical, not average"
          />
          <Secondary label="Time to a lead" value={duration} hint="Up to the hand-over" />
        </div>
      </div>

      {/*
        The whole, as one track. The filled part is the leads; the rest is everything that
        finished without one — which is the context the percentage alone loses.

        One series, so `--primary` and nothing to validate. The 2px gap between the fill and the
        remainder keeps the two readable where they meet, rather than relying on the colour
        contrast of adjacent fills.
      */}
      <div className="mt-6">
        <div className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500"
            style={{ width: `${Math.max(rate, converted > 0 ? 1.5 : 0)}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="size-2 rounded-full bg-primary" />
            {converted} left their details
          </span>
          <span>{conversations - converted} finished without</span>
        </div>
      </div>
    </section>
  );
}

function Secondary({
  label, value, hint, className,
}: Readonly<{ label: string; value: string; hint: string; className?: string }>) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums">{value}</p>
      <p className="text-[11px] text-muted-foreground/70">{hint}</p>
    </div>
  );
}
