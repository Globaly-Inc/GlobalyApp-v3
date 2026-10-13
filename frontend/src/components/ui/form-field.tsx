import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"
import { FieldError } from "@/components/field-error"

type FormFieldProps = {
  label: React.ReactNode
  /** The control's id, so the label targets it. */
  htmlFor?: string
  required?: boolean
  /** Shows a muted "(optional)" after the label. */
  optional?: boolean
  hint?: React.ReactNode
  error?: string
  /** Span every column of the section's grid (descriptions, editors). */
  wide?: boolean
  className?: string
  children: React.ReactNode
}

/**
 * Label, control, hint and error stacked the same way everywhere (mockup `.field`). Uses flex + gap, not
 * `space-y`, so Base UI's focus-guard spans inside a Combobox can't add stray margin (see AGENTS.md).
 */
function FormField({ label, htmlFor, required, optional, hint, error, wide, className, children }: Readonly<FormFieldProps>) {
  const errorId = htmlFor && error ? `${htmlFor}-error` : undefined
  return (
    <div data-slot="form-field" className={cn("flex min-w-0 flex-col gap-2", wide && "sm:col-span-full", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span aria-hidden className="text-destructive">*</span>}
        {optional && <span className="font-normal text-muted-foreground">(optional)</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <FieldError id={errorId} message={error} />
    </div>
  )
}

export { FormField }
