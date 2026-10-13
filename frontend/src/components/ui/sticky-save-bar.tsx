import { cn } from "@/lib/utils"

/**
 * Keeps a long form's Save row in view (GlobalyOS-V2 `STICKY_SAVE_BAR`, mockup `.sticky-save`). From `md`
 * up it sticks to the bottom of the window; on phones the bottom nav would cover it, so it stays in flow.
 * Needs no `overflow: hidden` ancestor — the portal shell's <main> uses `overflow-x-clip` for that reason.
 */
function StickySaveBar({ className, children, status, ...props }: React.ComponentProps<"div"> & { status?: React.ReactNode }) {
  return (
    <div
      data-slot="sticky-save-bar"
      className={cn(
        "flex flex-wrap items-center justify-end gap-2 border-t border-border bg-background/95 py-3 md:sticky md:bottom-0 md:z-10 md:backdrop-blur",
        className
      )}
      {...props}
    >
      {status && <span className="mr-auto text-xs text-muted-foreground">{status}</span>}
      {children}
    </div>
  )
}

export { StickySaveBar }
