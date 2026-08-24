import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared shell for the in-app UI mockups used on the public For* pages.
 * Matches the rounded-2xl shadow-xl frame used elsewhere on those pages.
 */
export function MockupFrame({
  children,
  className,
  chrome = true,
  label,
}: Readonly<{ children: ReactNode; className?: string; chrome?: boolean; label?: string }>) {
  return (
    <div className={cn("rounded-2xl shadow-xl overflow-hidden bg-card border border-border w-full", className)}>
      {chrome && (
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/50">
          <span className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-accent" />
          <span className="h-2.5 w-2.5 rounded-full bg-primary/40" />
          {label && <span className="ml-3 text-xs text-muted-foreground font-medium truncate">{label}</span>}
        </div>
      )}
      <div className="p-5 bg-background">{children}</div>
    </div>
  );
}

/**
 * The card these mockups draw is V2's shadcn `Card` — a plain bordered surface.
 * v3's `Card` primitive adds its own flex column, ring and `--card-spacing` padding,
 * which every mockup here would have to override class by class, so keep the flat div.
 */
export function MockupCard({
  className,
  children,
  style,
}: Readonly<{ className?: string; children: ReactNode; style?: React.CSSProperties }>) {
  return (
    <div className={cn("rounded-lg border bg-card text-card-foreground shadow-sm", className)} style={style}>
      {children}
    </div>
  );
}

/** V2's `Progress` at the size these mockups use it: a filled track, no primitive needed. */
export function MockupBar({ value, className }: Readonly<{ value: number; className?: string }>) {
  return (
    <div className={cn("relative w-full overflow-hidden rounded-full bg-secondary h-2", className)}>
      <div className="h-full bg-primary transition-all" style={{ width: `${value}%` }} />
    </div>
  );
}
