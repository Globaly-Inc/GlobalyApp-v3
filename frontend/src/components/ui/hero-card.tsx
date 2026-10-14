import { cn } from "@/lib/utils"

type HeroCardProps = Omit<React.ComponentProps<"section">, "title" | "children"> & {
  /** The greeting, rendered as the page's h1. */
  title: React.ReactNode
  subtitle?: React.ReactNode
  /** Right-hand slot from `sm` up: a progress capsule, chips, a CTA. */
  aside?: React.ReactNode
  /** Extra content under the title row (chips, quick facts). */
  children?: React.ReactNode
  className?: string
}

/**
 * The navy greeting card at the top of every portal home (mockup `.hero-card` / `.bp-hero`): `--gradient-primary`
 * with a soft highlight, white text. Use `HeroChip` for the frosted pills inside it.
 */
function HeroCard({ title, subtitle, aside, children, className, ...props }: Readonly<HeroCardProps>) {
  return (
    <section
      data-slot="hero-card"
      className={cn(
        "relative isolate overflow-hidden rounded-xl bg-(image:--gradient-primary) px-5 py-6 text-white shadow-lg sm:px-8 sm:py-7",
        "before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:bg-[radial-gradient(60%_120%_at_85%_0%,rgb(255_255_255/0.14),transparent_60%),radial-gradient(40%_80%_at_0%_100%,rgb(255_255_255/0.06),transparent_70%)]",
        className
      )}
      {...props}
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 max-w-xl">
          <h1 className="font-heading text-2xl font-medium leading-tight tracking-[-0.02em] text-white sm:text-[1.625rem]">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-white/80">{subtitle}</p>}
        </div>
        {aside && <div className="shrink-0">{aside}</div>}
      </div>
      {children && <div className="mt-5">{children}</div>}
    </section>
  )
}

/** Frosted pill inside a HeroCard (mockup `.hero-chip` / `.bp-capsule`). */
function HeroChip({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="hero-chip"
      className={cn(
        "inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm text-white ring-1 ring-inset ring-white/15 backdrop-blur-sm",
        className
      )}
      {...props}
    />
  )
}

export { HeroCard, HeroChip }
