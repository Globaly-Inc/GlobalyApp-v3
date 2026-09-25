"use client";

import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { AlyOrb } from "@/components/site/aly-orb";
import { cn } from "@/lib/utils";

/**
 * The shared vocabulary for every product demo on the page: a browser frame, a
 * plausible institution page behind it, and the GlobalyAI panel itself.
 *
 * These are drawn, not screenshotted, so they stay crisp, themeable, readable
 * by a screen reader, and free of any real institution's branding. Radii and
 * shadows follow the reference: very round, one soft shadow.
 */

export function BrowserFrame({
  url = "your-university.edu/programs",
  children,
  className,
}: Readonly<{ url?: string; children: ReactNode; className?: string }>) {
  return (
    <div className={cn("overflow-hidden rounded-[30px] bg-[var(--card)] shadow-panel", className)}>
      <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-3">
        <div className="flex gap-1.5" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff9d9d]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#ffd27f]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#9ee4ae]" />
        </div>
        <div className="ml-2 flex min-w-0 flex-1 items-center gap-1.5 rounded-full bg-[var(--card)] px-3 py-1.5 text-[var(--muted-foreground)]">
          <Lock className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 truncate text-[11px]">{url}</span>
        </div>
      </div>
      {children}
    </div>
  );
}

/**
 * A generic institution page sitting behind the assistant. Intentionally
 * abstract — gray type blocks, no logo, no real school — so the eye lands on
 * the conversation rather than reading the page copy.
 */
export function SiteBackdrop({ className }: Readonly<{ className?: string }>) {
  return (
    <div className={cn("select-none p-6 sm:p-8", className)} aria-hidden="true">
      <div className="flex items-center justify-between border-b border-[var(--border)] pb-5">
        <div className="h-4 w-24 rounded-full bg-[var(--primary)]/15" />
        <div className="hidden gap-5 sm:flex">
          {["Programs", "Admissions", "Tuition", "Campus"].map((item) => (
            <span key={item} className="text-[11.5px] font-semibold text-[var(--muted-foreground)]">
              {item}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-7 max-w-sm space-y-3">
        <div className="h-6 w-4/5 rounded-full bg-[var(--skeleton-1)]" />
        <div className="h-6 w-3/5 rounded-full bg-[var(--skeleton-2)]" />
        <div className="mt-5 space-y-2.5">
          <div className="h-2.5 w-full rounded-full bg-[var(--skeleton-3)]" />
          <div className="h-2.5 w-11/12 rounded-full bg-[var(--skeleton-3)]" />
          <div className="h-2.5 w-2/3 rounded-full bg-[var(--skeleton-3)]" />
        </div>
      </div>

      <div className="mt-8 grid grid-cols-3 gap-3">
        {[0, 1, 2].map((card) => (
          <div key={card} className="space-y-2.5 rounded-2xl bg-[var(--surface-soft)] p-4">
            <div className="h-1.5 w-8 rounded-full bg-[var(--primary)]/25" />
            <div className="h-2.5 w-full rounded-full bg-[var(--card)]" />
            <div className="h-2.5 w-3/4 rounded-full bg-[var(--card)]" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** The assistant's header bar — mark, name, and the "live" status line. */
export function PanelHeader({ subtitle = "Your AI counselor" }: Readonly<{ subtitle?: string }>) {
  return (
    <div className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--card)] px-4 py-3.5">
      {/* Aly's own mark — the assistant has an identity in the product, so
          the panel shows it rather than a generic glyph. */}
      <AlyOrb className="h-9 w-9 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="min-w-0 truncate text-[14px] font-bold leading-tight text-[var(--foreground)]">GlobalyAI</p>
        <p className="flex items-center gap-1.5 min-w-0 truncate text-[11px] leading-tight text-[var(--muted-foreground)]">
          <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full rounded-full bg-[#53c578] animate-pulse-ring" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#53c578]" />
          </span>
          {subtitle}
        </p>
      </div>
    </div>
  );
}

/**
 * `size` exists for the transcript beat, where the same conversation is read
 * across the full stage rather than inside a 320px panel: at panel size the
 * type would be a third the height of everything around it.
 */
export function Bubble({
  from,
  size = "sm",
  children,
  className,
}: Readonly<{ from: "ai" | "user"; size?: "sm" | "md"; children: ReactNode; className?: string }>) {
  const isAi = from === "ai";
  return (
    <div className={cn("flex animate-msg-in", isAi ? "justify-start" : "justify-end", className)}>
      <div
        className={cn(
          size === "sm"
            ? "max-w-[86%] px-4 py-2.5 text-[13px] leading-[1.5]"
            : "max-w-[85%] px-4 py-2 text-[14px] leading-[1.5]",
          isAi
            ? "rounded-[18px] rounded-tl-md bg-[var(--card)] text-[var(--foreground)] shadow-soft"
            : "rounded-[18px] rounded-tr-md bg-[linear-gradient(120deg,var(--primary),var(--primary-bright))] text-white",
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** Three settling dots. Reads as "thinking", not as a loading spinner. */
export function Typing({ label = "GlobalyAI is typing" }: Readonly<{ label?: string }>) {
  return (
    <div className="flex animate-msg-in justify-start">
      <div className="flex items-center gap-1 rounded-[18px] rounded-tl-md bg-[var(--card)] px-4 py-3 shadow-soft">
        <span className="sr-only">{label}</span>
        {[0, 1, 2].map((dot) => (
          <span
            key={dot}
            className="h-1.5 w-1.5 rounded-full bg-[var(--muted-foreground)] animate-typing-dot"
            style={{ animationDelay: `${dot * 160}ms` }}
            aria-hidden="true"
          />
        ))}
      </div>
    </div>
  );
}

/** A suggested reply. `picked` shows the moment the visitor chooses one. */
export function Chip({
  children,
  picked = false,
  className,
}: Readonly<{ children: ReactNode; picked?: boolean; className?: string }>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition-all duration-300",
        picked
          ? "bg-[var(--primary)] text-white"
          : "bg-[var(--card)] text-[var(--primary)] shadow-soft",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** The composer. Inert by design — this is a depiction, not a live widget. */
export function Composer({
  placeholder = "Ask about programs, admissions, tuition…",
}: Readonly<{ placeholder?: string }>) {
  return (
    <div className="flex items-center gap-2 border-t border-[var(--border)] bg-[var(--card)] px-3 py-3" aria-hidden="true">
      <div className="flex-1 min-w-0 truncate rounded-full bg-[var(--surface-soft)] px-4 py-2.5 text-[11.5px] text-[var(--muted-foreground)]">
        {placeholder}
      </div>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(120deg,var(--primary),var(--primary-bright))]">
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-white" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </div>
  );
}
