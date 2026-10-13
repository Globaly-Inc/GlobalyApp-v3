import type { ComponentType } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Icon = ComponentType<{ className?: string }>;

/**
 * SectionCard/OneToManySection without the add and edit affordances.
 *
 * Not imported from the portal: OneToManySection requires an `onAdd` and SectionCard's edit button
 * an `onEdit`, and a business must never be offered a way to change a student's record. Same
 * Card / CardTitle / count-Badge composition, so the two read identically.
 */
export function Section({
  icon: Icon,
  title,
  count,
  children,
}: Readonly<{
  icon: Icon;
  title: string;
  count?: number;
  children: React.ReactNode;
}>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground" />
          {title}
          {count != null && count > 0 && <Badge variant="secondary">{count}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {count === 0 ? <p className="text-sm text-muted-foreground">Not provided.</p> : children}
      </CardContent>
    </Card>
  );
}

/** The portal's ItemRow, minus edit/delete, plus a badge slot. */
export function Row({
  icon: Icon,
  title,
  badge,
  subtitle,
  meta,
}: Readonly<{
  icon?: Icon;
  title: string;
  badge?: string | null;
  subtitle?: string | null;
  meta?: string | null;
}>) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border p-3">
      {Icon && (
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Icon className="size-4 text-muted-foreground" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium text-foreground">{title}</p>
          {badge && (
            <Badge variant="secondary" className="shrink-0">
              {badge}
            </Badge>
          )}
        </div>
        {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
        {meta && <p className="mt-0.5 text-xs text-muted-foreground">{meta}</p>}
      </div>
    </div>
  );
}

/** Badge chips for a DescriptionItem value; em dash when empty, like every other field. */
export function BadgeValues({ values }: Readonly<{ values?: string[] }>) {
  if (!values?.length) return <>—</>;
  return (
    <span className="mt-1 flex flex-wrap gap-1.5">
      {values.map((v) => (
        <Badge key={v} variant="secondary">
          {v}
        </Badge>
      ))}
    </span>
  );
}
