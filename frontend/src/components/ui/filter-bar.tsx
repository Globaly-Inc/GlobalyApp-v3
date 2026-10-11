import { Search } from "lucide-react"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"

/**
 * The strip of search and filters above a data list (mockup `.filterbar`): one tinted, bordered row that
 * wraps on narrow screens. Children are the controls; a `SearchInput` grows to fill the row.
 */
function FilterBar({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="filter-bar"
      className={cn("flex flex-wrap items-center gap-2 rounded-lg border border-border bg-secondary p-1.5", className)}
      {...props}
    />
  )
}

/** A search field with a leading icon. `aria-label` defaults to the placeholder. */
function SearchInput({ className, placeholder = "Search…", ...props }: React.ComponentProps<typeof Input>) {
  return (
    <div data-slot="search-input" className={cn("relative min-w-48 flex-1", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input type="search" placeholder={placeholder} aria-label={placeholder} className="h-10 bg-background pl-9" {...props} />
    </div>
  )
}

export { FilterBar, SearchInput }
