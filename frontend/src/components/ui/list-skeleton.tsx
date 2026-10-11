import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

type ListSkeletonProps = {
  count?: number
  /** The real list's layout (stack or grid classes), so placeholders land where rows will. */
  className?: string
  /** Each placeholder's classes — match the real row or card height. */
  itemClassName?: string
}

/** Loading placeholder shaped like the list it replaces, instead of a centred spinner. */
function ListSkeleton({ count = 5, className, itemClassName }: Readonly<ListSkeletonProps>) {
  return (
    <div data-slot="list-skeleton" className={className ?? "space-y-2"}>
      <span role="status" className="sr-only">
        Loading…
      </span>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} aria-hidden className={cn("h-10 w-full", itemClassName)} />
      ))}
    </div>
  )
}

/** A card-shaped loading placeholder: title bar plus `lines` avatar rows. */
function CardSkeleton({ lines = 3, className }: Readonly<{ lines?: number; className?: string }>) {
  return (
    <div data-slot="card-skeleton" className={cn("rounded-lg border border-border bg-card p-4 shadow-sm", className)}>
      <span role="status" className="sr-only">
        Loading…
      </span>
      <Skeleton aria-hidden className="mb-4 h-5 w-32" />
      <div className="space-y-3" aria-hidden>
        {Array.from({ length: lines }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-8 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-2 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export { ListSkeleton, CardSkeleton }
