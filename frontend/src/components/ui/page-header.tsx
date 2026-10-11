import { cn } from "@/lib/utils"

type PageHeaderProps = {
  /** The page's one h1. A ReactNode so a title can carry an inline icon. */
  title: React.ReactNode
  subtitle?: React.ReactNode
  /** Before the title block, e.g. a back button. */
  leading?: React.ReactNode
  /** Inline after the title, e.g. status badges. Outside the h1 so they aren't part of its name. */
  badges?: React.ReactNode
  /** Actions, right-aligned from `sm` up. */
  children?: React.ReactNode
  className?: string
}

/**
 * Every portal page's header (GlobalyOS-V2 `PageHeader`, mockup `.page-header`): display-font h1,
 * muted subtitle, actions on the right, a hairline below.
 */
function PageHeader({ title, subtitle, leading, badges, children, className }: Readonly<PageHeaderProps>) {
  const titleBlock = (
    <div className="min-w-0 space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="flex items-center gap-2 font-heading text-2xl font-medium leading-tight tracking-[-0.01em] text-foreground [&_svg]:size-[1.375rem] [&_svg]:shrink-0">
          {title}
        </h1>
        {badges}
      </div>
      {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  )

  return (
    <header
      data-slot="page-header"
      className={cn(
        "flex flex-col gap-4 border-b border-border pt-2 pb-5 sm:flex-row sm:items-end sm:justify-between",
        className
      )}
    >
      {leading ? (
        <div className="flex min-w-0 items-center gap-3">
          {leading}
          {titleBlock}
        </div>
      ) : (
        titleBlock
      )}
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  )
}

export { PageHeader }
