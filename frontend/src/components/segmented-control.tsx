"use client";

import { cn } from "@/lib/utils";

/** A few fixed options with a pill that slides to the active one. Equal-width columns, so the
 * pill moves by whole widths. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  "aria-label": ariaLabel,
  className,
}: Readonly<{
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  "aria-label": string;
  className?: string;
}>) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn("relative grid w-fit rounded-lg bg-muted/60 p-[3px]", className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden
        className="absolute inset-y-[3px] left-[3px] rounded-md bg-background shadow-sm transition-transform duration-300 ease-[cubic-bezier(.3,1.3,.5,1)] motion-reduce:transition-none"
        style={{ width: `calc((100% - 6px) / ${options.length})`, transform: `translateX(${index * 100}%)` }}
      />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className="relative z-10 whitespace-nowrap rounded-md px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground aria-pressed:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
