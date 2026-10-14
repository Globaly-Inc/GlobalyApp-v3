import { cn } from "@/lib/utils"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type FormSectionProps = {
  title: React.ReactNode
  description?: React.ReactNode
  /** Top-right of the card, e.g. an "Add intake" button. */
  action?: React.ReactNode
  /** Field grid columns from `sm` up. `1` stacks everything (long text, editors). */
  columns?: 1 | 2 | 3
  className?: string
  contentClassName?: string
  children: React.ReactNode
}

const COLUMNS = { 1: "", 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3" } as const

/** One titled card of a create/edit form (mockup C4 `.card` with `.card-h` + field grid). */
function FormSection({ title, description, action, columns = 2, className, contentClassName, children }: Readonly<FormSectionProps>) {
  return (
    <Card data-slot="form-section" className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base [&_svg]:size-4 [&_svg]:text-muted-foreground">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent className={cn("grid gap-4", COLUMNS[columns], contentClassName)}>{children}</CardContent>
    </Card>
  )
}

export { FormSection }
