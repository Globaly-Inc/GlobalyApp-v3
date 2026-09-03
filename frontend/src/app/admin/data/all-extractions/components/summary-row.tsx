"use client";

/** One line of the review step. Blank optional values show as "Not set" rather than vanishing. */
export function SummaryRow({ label, value }: Readonly<{ label: string; value: string | string[] }>) {
  const list = Array.isArray(value) ? value : [value].filter(Boolean);
  return (
    <div className="flex flex-col gap-0.5 border-b border-border pb-2 last:border-0">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      {list.length === 0 ? (
        <span className="text-muted-foreground/70">Not set</span>
      ) : (
        list.map((item, i) => (
          <span key={`${item}-${i}`} className="break-all">{item}</span>
        ))
      )}
    </div>
  );
}
