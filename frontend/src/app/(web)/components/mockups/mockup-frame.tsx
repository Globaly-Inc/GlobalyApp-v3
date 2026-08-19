import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared shell for the in-app UI mockups on the public "For …" pages, ported from V1's
 * `components/public/mockups/MockupFrame.tsx`.
 *
 * The small primitives below (card / input / progress bar / pill button) are deliberately local
 * copies of what V1's shadcn primitives rendered, NOT wrappers around `@/components/ui/*`. The
 * shared V3 primitives have all drifted from V1 in ways that change geometry — the card grew
 * `py-(--card-spacing)`, `gap-4` and a ring; `Input` went from `h-10` to `h-8`; `Button size="lg"`
 * from `h-11` to `h-9`; `Progress` changed API entirely so `className="h-2"` no longer sizes the
 * track. The portals depend on that new styling, so it must not be reverted centrally. These
 * mockups are static illustrations of the product rather than live UI, so they carry V1's own
 * boxes and stay pixel-faithful to the live site without touching anything shared.
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

/** V1's `Card` box: `rounded-lg border bg-card text-card-foreground shadow-sm`, nothing else. */
export function MockupCard({
  children,
  className,
  style,
}: Readonly<{ children: ReactNode; className?: string; style?: CSSProperties }>) {
  return (
    <div className={cn("rounded-lg border bg-card text-card-foreground shadow-sm", className)} style={style}>
      {children}
    </div>
  );
}

/** V1's `Input` at its default size, always read-only — these are drawings of a form, not a form. */
export function MockupInput({
  value,
  type,
  className,
}: Readonly<{ value: string; type?: "text" | "password"; className?: string }>) {
  return (
    <input
      readOnly
      type={type}
      value={value}
      tabIndex={-1}
      aria-hidden="true"
      className={cn(
        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background md:text-sm",
        className,
      )}
    />
  );
}

/** V1's `Progress`: a rounded track with a primary-filled indicator. */
export function MockupProgress({ value, className }: Readonly<{ value: number; className?: string }>) {
  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("relative h-4 w-full overflow-hidden rounded-full bg-secondary", className)}
    >
      <div className="h-full w-full flex-1 bg-primary" style={{ transform: `translateX(-${100 - value}%)` }} />
    </div>
  );
}

const MOCKUP_BADGE_BASE =
  "inline-flex items-center rounded-full border px-2.5 py-0.5 pt-[3px] text-xs font-semibold transition-colors";
const MOCKUP_BADGE_VARIANTS = {
  default: "border-transparent bg-primary text-primary-foreground",
  secondary: "border-transparent bg-secondary text-secondary-foreground",
  outline: "text-foreground",
} as const;

/** V1's `Badge` — `rounded-full px-2.5 font-semibold pt-[3px]`, and no fixed `h-5`. */
export function MockupBadge({
  children,
  variant = "default",
  className,
}: Readonly<{ children: ReactNode; variant?: keyof typeof MOCKUP_BADGE_VARIANTS; className?: string }>) {
  return <div className={cn(MOCKUP_BADGE_BASE, MOCKUP_BADGE_VARIANTS[variant], className)}>{children}</div>;
}

const MOCKUP_BUTTON_SIZES = {
  default: "h-10 px-4 py-2",
  sm: "h-9 rounded-md px-3",
  lg: "h-11 rounded-md px-8",
} as const;

/** V1's `Button` in its default (primary) variant. Inert: a picture of a button, not a control. */
export function MockupButton({
  children,
  size = "default",
  className,
}: Readonly<{ children: ReactNode; size?: keyof typeof MOCKUP_BUTTON_SIZES; className?: string }>) {
  return (
    <div
      className={cn(
        // `flex`, not V1's `inline-flex`: V1 renders a real <button>, which does not pick up the parent's
        // text baseline. A <div class="inline-flex"> does, and the descender under it added 8px to the card.
        "flex items-center justify-center gap-1.5 rounded-md bg-primary text-sm font-medium text-primary-foreground",
        MOCKUP_BUTTON_SIZES[size],
        className,
      )}
    >
      {children}
    </div>
  );
}
