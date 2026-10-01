"use client";

/**
 * A ranked list of counts, as bars.
 *
 * ONE series — every bar is the same measure (journeys) — so there is no legend and no
 * categorical palette: the series takes `bg-primary`, which is a theme token and therefore
 * correct in both light and dark without a second definition. Identity lives in the row label,
 * never in colour alone.
 *
 * Bars are scaled against the largest value in THIS list, not against the total. The question
 * these answer is "which of these is biggest", and scaling to a total would flatten every row of
 * a long tail into an unreadable sliver.
 */
export function InsightBars({
  rows, emptyLabel,
}: Readonly<{
  rows: Array<{ key: string; label: React.ReactNode; count: number; title?: string }>;
  emptyLabel: string;
}>) {
  if (!rows.length) {
    return <p className="py-6 text-center text-xs text-muted-foreground">{emptyLabel}</p>;
  }
  const max = Math.max(...rows.map((r) => r.count), 1);

  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <li key={r.key} className="flex flex-col gap-1" title={r.title}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 text-sm">{r.label}</span>
            {/* tabular-nums so the counts line up down the column */}
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{r.count}</span>
          </div>
          {/* Thin mark, square at the baseline and rounded at the data end. The track carries the
              full width so a short bar still reads as "short", not as missing. */}
          <div className="h-1.5 w-full overflow-hidden rounded-[2px] bg-muted">
            <div
              className="h-full rounded-r-[4px] bg-primary"
              style={{ width: `${Math.max((r.count / max) * 100, 2)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** One figure and what it means. No plot — a single number needs no chart. */
export function StatTile({
  label, value, hint,
}: Readonly<{ label: string; value: string; hint?: string }>) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
