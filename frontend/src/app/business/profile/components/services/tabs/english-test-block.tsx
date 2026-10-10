"use client";

import type { CSSProperties } from "react";

type LanguageTestRow = {
  test_type_name?: string;
  overall_score?: number | string | null;
  listening_score?: number | string | null;
  reading_score?: number | string | null;
  writing_score?: number | string | null;
  speaking_score?: number | string | null;
};

const SUBSCORES = [
  ["listening_score", "Listen"],
  ["reading_score", "Read"],
  ["writing_score", "Write"],
  ["speaking_score", "Speak"],
] as const;

/** Per-section maximum for each English test, so the meters share a scale. Unknown tests get no bar. */
function sectionMax(name: string): number | null {
  const n = name.toLowerCase();
  if (n.includes("ielts")) return 9;
  if (n.includes("toefl")) return 30;
  if (n.includes("pte")) return 90;
  if (n.includes("duolingo")) return 160;
  if (n.includes("cambridge")) return 230;
  return null;
}

/** One English test requirement: name, big overall score, and the four section minimums as meters. */
export function EnglishTestBlock({ test }: Readonly<{ test: Record<string, unknown> }>) {
  const t = test as LanguageTestRow;
  const name = t.test_type_name || "English test";
  const max = sectionMax(name);
  const subs = SUBSCORES.flatMap(([key, label]) => {
    const v = t[key];
    return v == null || v === "" ? [] : [{ label, value: String(v) }];
  });

  return (
    <div className="grid content-start gap-2 rounded-xl border p-3">
      <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">English test</p>
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm font-semibold">{name}</span>
        {t.overall_score != null && t.overall_score !== "" && (
          <span className="shrink-0 text-lg font-bold tabular-nums">
            {t.overall_score}
            <span className="ml-1 font-mono text-[11px] font-medium text-muted-foreground">overall</span>
          </span>
        )}
      </div>
      {subs.length > 0 && (
        <div className="grid grid-cols-4 gap-1.5">
          {subs.map((s, j) => {
            const pct = max ? Math.min(100, (Number(s.value) / max) * 100) : null;
            return (
              <div key={s.label} className="grid gap-1 font-mono text-[10.5px] font-medium text-muted-foreground">
                <span>{s.label} {s.value}</span>
                {pct != null && !Number.isNaN(pct) && (
                  <span className="h-1.5 overflow-hidden rounded-full bg-border">
                    <span
                      className="animate-fill-x block h-full rounded-full bg-primary"
                      style={{ width: `${pct}%`, "--fill-delay": `${300 + j * 70}ms` } as CSSProperties}
                    />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
