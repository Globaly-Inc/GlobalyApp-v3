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

        <div className="flex flex-wrap justify-center gap-2">
          {STARTER_CATEGORIES.map(({ label, Icon }) => (
            <button
              key={label}
              type="button"
              onClick={() => setOpenLabel((cur) => (cur === label ? null : label))}
              aria-pressed={openLabel === label}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                openLabel === label
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "bg-card text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>

        {openQuestions.length > 0 && (
          <div className="mx-auto flex w-full max-w-xl flex-col gap-0.5">
            {openQuestions.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => onSelect(q)}
                className="group flex items-start gap-2 rounded-xl border border-transparent px-2.5 py-2 text-left text-sm text-muted-foreground transition-all hover:border-border hover:bg-card hover:text-foreground hover:shadow-xs"
              >
                <span className="flex-1 leading-snug">{q}</span>
                <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
