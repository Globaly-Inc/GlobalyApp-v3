// Shared shell for the super-admin pages that don't have a V3 backend yet.
// Renders the real V2 page title/description plus a representative, domain-specific
// list so the nav destination looks and reads like its V2 counterpart.
// ponytail: mock rows only, no live data or actions — wire up apis/+store/ per page
// once that module's V3 endpoints exist, following the pattern in admin/apis + admin/store.

import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface AdminListColumn {
  key: string;
  label: string;
}

export interface AdminListRow {
  id: string | number;
  [key: string]: React.ReactNode;
}

export interface AdminPlaceholderViewProps {
  title: string;
  description: string;
  columns: AdminListColumn[];
  rows: AdminListRow[];
  actionLabel?: string;
  actionIcon?: LucideIcon;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  active: "default",
  published: "default",
  approved: "default",
  live: "default",
  completed: "default",
  pending: "outline",
  draft: "outline",
  review: "outline",
  scheduled: "outline",
  flagged: "destructive",
  suspended: "destructive",
  rejected: "destructive",
  declined: "destructive",
};

export function StatusBadge({ status }: Readonly<{ status: string }>) {
  const variant = STATUS_VARIANT[status.toLowerCase()] ?? "secondary";
  return <Badge variant={variant}>{status}</Badge>;
}

/** Just the records Card — for pages that render their own header (e.g. tabbed pages). */
export function AdminRecordsCard({ columns, rows }: Readonly<Pick<AdminPlaceholderViewProps, "columns" | "rows">>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {rows.length} {rows.length === 1 ? "record" : "records"}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div
          className="grid gap-3 border-b border-border px-4 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
        >
          {columns.map((col, i) => (
            <span key={col.key} className={cn(i === 0 ? "" : "hidden sm:block")}>
              {col.label}
            </span>
          ))}
        </div>
        <div className="divide-y divide-border">
          {rows.map((row) => (
            <div
              key={row.id}
              className="grid items-center gap-3 px-4 py-3 text-sm"
              style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
            >
              {columns.map((col, i) => (
                <span
                  key={col.key}
                  className={cn(
                    "truncate",
                    i === 0 ? "font-medium text-foreground" : "hidden sm:block text-muted-foreground",
                  )}
                >
                  {row[col.key]}
                </span>
              ))}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function AdminPlaceholderView({
  title,
  description,
  columns,
  rows,
  actionLabel,
  actionIcon: ActionIcon,
}: Readonly<AdminPlaceholderViewProps>) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          <p className="text-muted-foreground mt-1">{description}</p>
        </div>
        {actionLabel && (
          <Button className="gap-1.5 flex-shrink-0">
            {ActionIcon && <ActionIcon className="h-4 w-4" />}
            {actionLabel}
          </Button>
        )}
      </div>

      <AdminRecordsCard columns={columns} rows={rows} />
    </div>
  );
}
