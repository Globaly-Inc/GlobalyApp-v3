import { cn } from "@/lib/utils"

/**
 * Read-mode label/value grid on detail pages (mockup `.kv`): two columns from `sm`, one on phones.
 * Pass `columns={1}` for narrow side cards.
 */
function DescriptionList({ columns = 2, className, ...props }: React.ComponentProps<"dl"> & { columns?: 1 | 2 }) {
  return (
    <dl
      data-slot="description-list"
      className={cn("grid grid-cols-1 gap-x-6 gap-y-5", columns === 2 && "sm:grid-cols-2", className)}
      {...props}
    />
  )
}

type DescriptionItemProps = {
  label: React.ReactNode
  /** Spans both columns (long text, addresses). */
  wide?: boolean
  /** Monospace value, for codes and ids. */
  mono?: boolean
  className?: string
  children: React.ReactNode
}

function DescriptionItem({ label, wide, mono, className, children }: Readonly<DescriptionItemProps>) {
  return (
    <div data-slot="description-item" className={cn("min-w-0", wide && "sm:col-span-full", className)}>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className={cn("mt-0.5 break-words text-sm font-medium text-foreground", mono && "font-mono")}>{children}</dd>
    </div>
  )
}

export { DescriptionList, DescriptionItem }
