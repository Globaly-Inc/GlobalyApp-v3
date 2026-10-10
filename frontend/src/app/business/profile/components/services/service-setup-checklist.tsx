"use client";

import { Check } from "lucide-react";
import { CountUp } from "@/components/count-up";
import { cn } from "@/lib/utils";

export type SetupStep<T extends string = string> = { label: string; done: boolean; tab?: T };

/** "Listing setup" card: a progress ring with the %, "X of Y steps done", and the steps — an
 * incomplete step with a `tab` is a button that jumps to it ("Add →" on hover). */
export function ServiceSetupChecklist<T extends string>({
  steps,
  onNavigateTab,
}: Readonly<{ steps: SetupStep<T>[]; onNavigateTab?: (tab: T) => void }>) {
  const doneCount = steps.filter((s) => s.done).length;
  const pct = steps.length ? Math.round((doneCount / steps.length) * 100) : 0;
  return (
    <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4 text-card-foreground transition-[box-shadow,border-color,transform] duration-300 hover:-translate-y-px hover:border-primary/20 hover:shadow-md">
      <div className="flex items-center gap-3.5">
        <div
          className="animate-ring-fill grid size-16 shrink-0 place-items-center rounded-full"
          style={{ "--ring-pct": `${pct}%`, background: "conic-gradient(var(--color-primary) var(--ring-p), var(--color-border) 0)" } as React.CSSProperties}
          role="img"
          aria-label={`${pct}% complete`}
        >
          <span className="grid size-[50px] place-items-center rounded-full bg-card font-mono text-sm font-bold">
            <span><CountUp value={pct} />%</span>
          </span>
        </div>
        <div>
          <h2 className="font-sans text-sm font-bold tracking-normal">Listing setup</h2>
          <p className="text-xs text-muted-foreground">{doneCount} of {steps.length} steps done</p>
        </div>
      </div>
      <ul className="stagger-in grid gap-1">
        {steps.map((s) => {
          const inner = (
            <>
              <span
                className={cn(
                  "grid size-[18px] shrink-0 place-items-center rounded-full border-[1.5px]",
                  s.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-border",
                )}
              >
                {s.done && <Check className="animate-pop-in size-3" strokeWidth={3} />}
              </span>
              {s.label}
            </>
          );
          const row = "-mx-2 flex w-[calc(100%+1rem)] items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px]";
          return (
            <li key={s.label}>
              {!s.done && s.tab && onNavigateTab ? (
                <button
                  type="button"
                  onClick={() => onNavigateTab(s.tab as T)}
                  className={cn(row, "group/step text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary")}
                >
                  {inner}
                  <span className="ml-auto text-[11.5px] font-semibold text-primary opacity-0 transition-opacity group-hover/step:opacity-100 group-focus-visible/step:opacity-100">
                    Add →
                  </span>
                </button>
              ) : (
                <div className={cn(row, s.done ? "text-foreground" : "text-muted-foreground")}>{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
