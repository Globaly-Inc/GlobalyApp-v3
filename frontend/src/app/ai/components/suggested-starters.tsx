"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { GREETINGS, STARTER_CATEGORIES } from "../const";
import { cn } from "@/lib/utils";

type SuggestedStartersProps = {
  onSelect: (question: string) => void;
  /** First name for the greeting. Falls back to the generic prompt when unknown (embed/widget). */
  name?: string | null;
  /** Rendered between the greeting and the chips — the composer, on the full-page surface. */
  children?: ReactNode;
};

export function SuggestedStarters({ onSelect, name, children }: Readonly<SuggestedStartersProps>) {
  // Categories collapse to one chip each; "Course Search" opens by default so the hero shows
  // recommended questions immediately instead of an empty row of chips.
  const [openLabel, setOpenLabel] = useState<string | null>(STARTER_CATEGORIES[0]?.label ?? null);
  // Picked once per mount (useState initializer), not per render — and only on the client,
  // so SSR/hydration can't disagree about which greeting was drawn.
  const [greeting, setGreeting] = useState<string | null>(null);
  useEffect(() => {
    setGreeting(GREETINGS[Math.floor(Math.random() * GREETINGS.length)] ?? null);
  }, []);
  const openQuestions = STARTER_CATEGORIES.find((c) => c.label === openLabel)?.questions ?? [];

  return (
    <div className="relative isolate flex min-h-full flex-col justify-center px-4 py-10">
      {/* Soft brand wash behind the hero — decorative only, so it sits under the content and
          ignores pointer events. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-64 bg-[radial-gradient(ellipse_at_top,hsl(var(--gold)/0.12),transparent_60%)]"
      />

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <h2 className="flex items-center justify-center gap-2.5 text-center text-2xl font-semibold tracking-tight sm:text-3xl">
          <Sparkles className="size-6 shrink-0 text-primary sm:size-7" />
          <span className="gradient-text">
            {name && greeting ? greeting.replace("{name}", name) : "How can I help you today?"}
          </span>
        </h2>

        {children}

        <div className="flex flex-wrap justify-center gap-2.5">
          {STARTER_CATEGORIES.map(({ label, Icon }) => (
            <button
              key={label}
              type="button"
              onClick={() => setOpenLabel((cur) => (cur === label ? null : label))}
              aria-pressed={openLabel === label}
              className={cn(
                "flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium shadow-sm backdrop-blur-sm transition-all",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                "active:scale-95",
                openLabel === label
                  ? "border-primary bg-primary text-primary-foreground shadow-md shadow-primary/20"
                  : "border-border/70 bg-card/85 text-foreground hover:border-primary/50 hover:bg-accent hover:shadow-md",
              )}
            >
              <Icon className="size-4 shrink-0" />
              {label}
            </button>
          ))}
        </div>

        {openQuestions.length > 0 && (
          <div className="mx-auto flex w-full max-w-xl flex-col gap-1.5">
            {openQuestions.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => onSelect(q)}
                className={cn(
                  "group flex items-center gap-3 rounded-xl border border-border/60 bg-card/85 px-4 py-3 text-left text-sm text-foreground shadow-sm backdrop-blur-sm",
                  "transition-all hover:border-primary/40 hover:bg-card hover:shadow-md",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  "active:scale-[0.99]",
                )}
              >
                <span className="flex-1 leading-snug">{q}</span>
                <ArrowUpRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
