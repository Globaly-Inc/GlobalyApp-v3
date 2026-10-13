import type { ComponentType } from "react"

import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

type StatCardProps = {
  label: React.ReactNode
  value: React.ReactNode
  /** Muted line under the value: a delta, a breakdown, a unit. */
  hint?: React.ReactNode
  icon?: ComponentType<{ className?: string }>
  loading?: boolean
  className?: string
}

/** One headline number (mockup `.stat`): muted label + icon, display-font value, small hint. */
function StatCard({ label, value, hint, icon: Icon, loading = false, className }: Readonly<StatCardProps>) {
  return (
    <Card data-slot="stat-card" className={cn("gap-0 px-5", className)}>
      <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
        <span className="truncate">{label}</span>
        {Icon && <Icon className="size-4 shrink-0" aria-hidden />}
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-20" />
      ) : (
        <>
          <p className="mt-2 font-heading text-2xl font-medium leading-tight tracking-[-0.02em] tabular-nums text-foreground">{value}</p>
          {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
        </>
      )}
    </Card>
  )
}

export { StatCard }
