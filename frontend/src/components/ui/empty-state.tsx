import type { ComponentType } from "react"

import { cn } from "@/lib/utils"

type EmptyStateProps = {
  /** One calm line icon in a tinted disc — no illustrations, no emoji. */
  icon?: ComponentType<{ className?: string }>
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  secondaryAction?: React.ReactNode
  /** Less padding, for use inside a card. */
  compact?: boolean
  className?: string
}

/** Zero-data placeholder (GlobalyOS-V2 `EmptyState`, mockup `.empty`). */
function EmptyState({ icon: Icon, title, description, action, secondaryAction, compact = false, className }: Readonly<EmptyStateProps>) {
  return (
    <div
      data-slot="empty-state"
      className={cn("mx-auto flex max-w-md flex-col items-center justify-center text-center", compact ? "px-4 py-8" : "px-6 py-16", className)}
    >
      {Icon && (
        <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-primary-light text-primary">
          <Icon className="size-5" aria-hidden />
        </div>
      )}
      <h3 className="font-heading text-base font-medium text-foreground">{title}</h3>
      {description && <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</p>}
      {(action || secondaryAction) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  )
}

export { EmptyState }
