"use client";

import { ArrowRight, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { countLabel, headlineFor } from "../utils";
import type { KnowledgeTab, MemorySummary } from "../types";

/**
 * The state of this institution's counsellor, in one panel.
 *
 * The page used to open on a settings form, which answers "what can I change" before anyone has
 * been told "how is it doing" — so the first thing on screen now is the counsellor's own status,
 * and the one thing waiting on a human is a button rather than a number behind a tab.
 *
 * DELIBERATELY DARK IN BOTH THEMES. `--sidebar` is the only surface in this design system that
 * stays navy under `.dark` (11% -> 8% lightness), so the panel reads as part of the product's
 * chrome rather than as a hero that inverts. Everything painted on top is an opacity of white or
 * the brand aqua, both of which hold against either navy — no second palette, nothing to keep in
 * step when the theme changes.
 */
export function KnowledgeHeader({
  summary, unreviewedReplies, conversionRate, onJump,
}: Readonly<{
  summary: MemorySummary | null;
  unreviewedReplies: number;
  conversionRate: number | null;
  onJump: (tab: KnowledgeTab) => void;
}>) {
  const headline = headlineFor(summary, unreviewedReplies);

  return (
    <section className="relative overflow-hidden rounded-xl bg-sidebar text-sidebar-foreground">
      {/* Two soft lights rather than a gradient fill: a gradient across a panel this wide bands
          visibly on 8-bit displays, and blurred radials don't. Pointer-events off so they never
          eat a click meant for the figures. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-32 size-72 rounded-full bg-[hsl(var(--gold))] opacity-[0.12] blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -left-20 size-72 rounded-full bg-[hsl(var(--primary-bright))] opacity-20 blur-3xl"
      />

      <div className="relative flex flex-col gap-5 p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <span className="relative grid size-11 shrink-0 place-items-center rounded-xl bg-white/10 ring-1 ring-inset ring-white/15">
            <Brain className="size-5 text-white" />
            {/* The live dot. Ringed in the panel's own colour so it reads as sitting on the
                badge rather than floating over it. */}
            <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-emerald-400 ring-2 ring-sidebar" />
          </span>

          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold text-white">Your AI counsellor</h1>
            <p className="mt-1 text-sm leading-relaxed text-white/65">{headline.line}</p>
          </div>

          {headline.cta && (
            <Button
              size="sm"
              onClick={() => onJump(headline.cta!.tab)}
              className="hidden shrink-0 bg-white text-[hsl(222_47%_11%)] hover:bg-white/90 sm:inline-flex"
            >
              {headline.cta.label} <ArrowRight className="size-4" />
            </Button>
          )}
        </div>

        <div className="grid grid-cols-3 overflow-hidden rounded-lg bg-white/[0.04] ring-1 ring-inset ring-white/10">
          <Figure
            label="Rules in use"
            value={summary ? countLabel(summary.active, summary.saturated) : "—"}
            hint={summary?.alwaysOn ? `${summary.alwaysOn} on every reply` : "Followed when they fit the question"}
            onClick={() => onJump("memories")}
          />
          <Figure
            label="Waiting on you"
            value={summary ? String(summary.needsYou + unreviewedReplies) : "—"}
            hint={waitingHint(summary, unreviewedReplies)}
            urgent={!!summary && summary.needsYou + unreviewedReplies > 0}
            onClick={() => onJump(summary && summary.needsYou > 0 ? "memories" : "conversations")}
          />
          <Figure
            label="Became leads"
            value={conversionRate == null ? "—" : `${conversionRate}%`}
            hint={conversionRate == null ? "No finished conversations yet" : "Of finished conversations"}
            onClick={() => onJump("insights")}
          />
        </div>

        {/* The mobile home for the CTA the header row hides — a button that disappears under
            640px is a button someone on a phone never finds. */}
        {headline.cta && (
          <Button
            size="sm"
            onClick={() => onJump(headline.cta!.tab)}
            className="bg-white text-[hsl(222_47%_11%)] hover:bg-white/90 sm:hidden"
          >
            {headline.cta.label} <ArrowRight className="size-4" />
          </Button>
        )}
      </div>
    </section>
  );
}

function waitingHint(summary: MemorySummary | null, replies: number): string {
  if (!summary) return "Loading";
  const parts: string[] = [];
  // Flagged and conflicting are named separately from "suggested" even though `needsYou` counts
  // them once: the figure is a total, and the hint is what it is made of.
  if (summary.flagged > 0) parts.push(`${summary.flagged} flagged`);
  if (summary.conflicting > 0) parts.push(`${summary.conflicting} conflicting`);
  if (summary.candidate > 0) parts.push(`${summary.candidate} suggested`);
  if (replies > 0) parts.push(`${replies} ${replies === 1 ? "reply" : "replies"}`);
  return parts.length ? parts.join(" · ") : "Nothing outstanding";
}

/**
 * One figure in the console strip.
 *
 * A button, not a div: every one of these is the shortest route to the tab that explains it, and
 * a number someone instinctively clicks should go somewhere. `text-left` because the default
 * button centring would otherwise fight the column.
 */
function Figure({
  label, value, hint, onClick, urgent,
}: Readonly<{
  label: string;
  value: string;
  hint: string;
  onClick: () => void;
  urgent?: boolean;
}>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group cursor-pointer px-4 py-3.5 text-left transition-colors hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/40"
    >
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-white/45">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums",
          urgent ? "text-[hsl(var(--gold))]" : "text-white",
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 truncate text-xs text-white/45">{hint}</p>
    </button>
  );
}
