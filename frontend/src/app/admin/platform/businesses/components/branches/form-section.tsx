import type { LucideIcon } from "lucide-react";

/** A titled group of fields in the branch form: tinted icon tile, title, one-line hint. */
export function FormSection({
  icon: Icon,
  title,
  hint,
  required,
  children,
}: Readonly<{ icon: LucideIcon; title: string; hint: string; required?: boolean; children: React.ReactNode }>) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-3.5" />
        </div>
        <div>
          <h3 className="font-sans text-sm font-bold tracking-normal">
            {title} {required && <span className="text-destructive">*</span>}
          </h3>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
      </div>
      {children}
    </section>
  );
}
