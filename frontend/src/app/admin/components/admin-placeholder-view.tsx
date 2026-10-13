// Shared shell for the super-admin pages that don't have a V3 backend yet.
// Renders the real V2 page title/description plus a representative, domain-specific
// list so the nav destination looks and reads like its V2 counterpart.
// ponytail: mock rows only, no live data or actions — wire up apis/+store/ per page
// once that module's V3 endpoints exist, following the pattern in admin/apis + admin/store.

import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableBody, TableCard, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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

/** Just the records table — for pages that render their own header (e.g. tabbed pages). */
export function AdminRecordsCard({ columns, rows }: Readonly<Pick<AdminPlaceholderViewProps, "columns" | "rows">>) {
  const [first, ...rest] = columns;
  if (!first) return null;
  return (
    <TableCard>
      <div className="border-b border-border px-4 py-3 text-sm font-medium text-foreground">
        {rows.length} {rows.length === 1 ? "record" : "records"}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{first.label}</TableHead>
            {rest.map((col) => (
              <TableHead key={col.key} className="hidden sm:table-cell">{col.label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell primary>
                {row[first.key]}
                {/* Phones: the hidden columns as one muted line, so every value still shows. */}
                <span className="block truncate text-xs font-normal text-muted-foreground sm:hidden">
                  {rest.map((col) => row[col.key]).filter((v) => typeof v === "string" || typeof v === "number").join(" · ")}
                </span>
              </TableCell>
              {rest.map((col) => (
                <TableCell key={col.key} className="hidden text-muted-foreground sm:table-cell">{row[col.key]}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableCard>
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
    <PageBody>
      <PageHeader title={title} subtitle={description}>
        {actionLabel && (
          <Button>
            {ActionIcon && <ActionIcon />}
            {actionLabel}
          </Button>
        )}
      </PageHeader>
      <AdminRecordsCard columns={columns} rows={rows} />
    </PageBody>
  );
}
