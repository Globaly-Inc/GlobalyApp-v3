"use client";

/** Mockup `.subtabs`: soft track, white pill sliding under the active option, mono count after each label. */
export function TeamSubTabs<T extends string>({
  options, value, onChange,
}: Readonly<{ options: readonly { value: T; label: string; count: number | null }[]; value: T; onChange: (v: T) => void }>) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div
      role="group"
      aria-label="Team view"
      className="relative grid w-fit rounded-[10px] bg-muted/60 p-0.75"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden
        className="absolute inset-y-0.75 left-0.75 rounded-lg bg-card shadow-[0_1px_3px_rgb(17_26_64/0.12)] transition-transform duration-300 ease-[cubic-bezier(.3,1.3,.5,1)] motion-reduce:transition-none"
        style={{ width: `calc((100% - 6px) / ${options.length})`, transform: `translateX(${index * 100}%)` }}
      />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className="relative z-10 inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-2 text-[12.5px] font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary aria-pressed:text-foreground"
        >
          {o.label}
          {o.count !== null && <span className="font-mono text-[10.5px] font-semibold tabular-nums text-muted-foreground">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}
