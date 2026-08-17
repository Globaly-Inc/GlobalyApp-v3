"use client";

import { ArrowUpRight, Sparkles } from "lucide-react";
import { STARTER_CATEGORIES } from "../const";

type SuggestedStartersProps = {
  onSelect: (question: string) => void;
};

export function SuggestedStarters({ onSelect }: SuggestedStartersProps) {
  return (
    <div className="relative isolate flex min-h-full flex-col justify-center px-4 py-10">
      {/* Soft brand wash behind the hero — decorative only, so it sits under the content and
          ignores pointer events. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-64 bg-[radial-gradient(ellipse_at_top,hsl(var(--gold)/0.12),transparent_60%)]"
      />

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <div className="flex flex-col items-center text-center">
          <span className="mb-4 inline-flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
            <Sparkles className="size-6" />
          </span>
          <h2 className="gradient-text text-3xl font-semibold tracking-tight">AI Counsellor</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Ask me anything about courses, admissions, scholarships, or studying abroad.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {STARTER_CATEGORIES.map(({ label, Icon, questions }) => (
            <div
              key={label}
              className="flex flex-col gap-1 rounded-2xl border bg-background/60 p-3 shadow-xs backdrop-blur-sm"
            >
              <div className="mb-1 flex items-center gap-2 px-1">
                <span className="inline-flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-4" />
                </span>
                <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {label}
                </h3>
              </div>
              {questions.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => onSelect(q)}
                  className="group flex items-start gap-2 rounded-xl px-2 py-2 text-left text-sm transition-colors hover:bg-accent/60 hover:text-accent-foreground"
                >
                  <span className="flex-1">{q}</span>
                  <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
