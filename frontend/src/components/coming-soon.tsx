import Link from "next/link";
import { ArrowLeft, Sparkles, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ComingSoonProps = Readonly<{
  title: string;
  /** One line on what the feature will do. Falls back to a generic line. */
  description?: string;
  /** The same lucide icon the sidebar uses for this route, so the page reads as that nav item. */
  icon?: LucideIcon;
  /** Up to ~4 short capability lines. Omit rather than padding with filler. */
  features?: readonly string[];
  /** Where the "go back" button points — defaults to the personal portal home. */
  backHref?: string;
  backLabel?: string;
  className?: string;
}>;

export function ComingSoon({
  title,
  description = "We're building this. It'll show up here the moment it's ready.",
  icon: Icon = Sparkles,
  features,
  backHref = "/personal/portal",
  backLabel = "Back to home",
  className,
}: ComingSoonProps) {
  return (
    <section
      className={cn(
        "relative isolate flex min-h-[60vh] items-center justify-center overflow-hidden",
        "rounded-2xl border border-border bg-card px-6 py-16 sm:py-20",
        className,
      )}
    >
      {/* Dot grid, faded out toward the edges so the card doesn't end on a hard pattern seam. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-60 [background-image:radial-gradient(var(--border)_1px,transparent_1px)] [background-size:18px_18px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_40%,#000,transparent)]"
      />
      {/* Brand crimson bloom behind the icon — the theme's primary, at a weight that survives dark mode. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 -z-10 h-72 w-[38rem] max-w-[130%] -translate-x-1/2 -translate-y-1/3 rounded-full bg-primary/10 blur-3xl dark:bg-primary/20"
      />

      <div className="flex w-full max-w-lg flex-col items-center text-center">
        <span className="relative mb-6 inline-flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/20">
          <Icon className="size-7" aria-hidden />
          {/* Gold pip: the theme's accent metal, used here only as a "live work" marker. */}
          <span
            aria-hidden
            className="absolute -right-1 -top-1 flex size-3.5 items-center justify-center"
          >
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-[hsl(var(--gold))] opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-[hsl(var(--gold))]" />
          </span>
        </span>

        <span className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-3 py-1 text-[0.7rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          In development
        </span>

        <h1 className="text-balance text-2xl font-semibold tracking-[-0.02em] text-foreground sm:text-3xl">
          {title}
        </h1>
        <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
          {description}
        </p>

        {features && features.length > 0 && (
          <ul className="mt-8 grid w-full gap-x-6 gap-y-3 text-left sm:grid-cols-2">
            {features.map((feature) => (
              <li key={feature} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/60" />
                {feature}
              </li>
            ))}
          </ul>
        )}

        <Button variant="outline" className="mt-9" render={<Link href={backHref} />}>
          <ArrowLeft />
          {backLabel}
        </Button>
      </div>
    </section>
  );
}
