"use client"

import { Toggle as TogglePrimitive } from "@base-ui/react/toggle"
import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/** Pressed state is `data-pressed`. Used for density switches, view modes, filter chips. */
const toggleVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-sm font-medium text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-pressed:bg-background data-pressed:text-foreground data-pressed:shadow-sm [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      size: {
        default: "h-8 px-3",
        sm: "h-7 px-2.5 text-xs",
      },
    },
    defaultVariants: { size: "default" },
  }
)

/** A muted track like `TabsList`, so a density or view switch reads as one control. */
function ToggleGroup({ className, ...props }: ToggleGroupPrimitive.Props) {
  return (
    <ToggleGroupPrimitive
      data-slot="toggle-group"
      className={cn("inline-flex w-fit items-center gap-0.5 rounded-lg bg-muted/80 p-0.5", className)}
      {...props}
    />
  )
}

function ToggleGroupItem({ className, size, ...props }: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
  return <TogglePrimitive data-slot="toggle-group-item" className={cn(toggleVariants({ size }), className)} {...props} />
}

export { ToggleGroup, ToggleGroupItem, toggleVariants }
