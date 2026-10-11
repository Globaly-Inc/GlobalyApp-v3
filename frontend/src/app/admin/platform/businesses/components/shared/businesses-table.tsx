"use client";

import { Building2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { Table, TableBody, TableCard, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { BUSINESS_COLUMNS } from "./business-row";

/** Skeleton → empty state → table of `BusinessRow`s (passed as children). */
export function BusinessesTable({
  loading, empty, emptyTitle, selectAll, children,
}: Readonly<{
  loading: boolean;
  empty: boolean;
  emptyTitle: string;
  /** Header checkbox; omitted where bulk actions aren't offered. */
  selectAll?: { checked: boolean; onToggle: () => void };
  children: React.ReactNode;
}>) {
  if (loading && empty) return <ListSkeleton count={6} itemClassName="h-14" />;
  if (empty) return <EmptyState icon={Building2} title={emptyTitle} />;

  return (
    <TableCard className={cn("transition-opacity", loading && "opacity-60")} aria-busy={loading}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-px">
              {selectAll && <Checkbox checked={selectAll.checked} onCheckedChange={selectAll.onToggle} aria-label="Select all visible" />}
            </TableHead>
            {BUSINESS_COLUMNS.map((col) => (
              <TableHead
                key={col.label}
                numeric={"numeric" in col ? col.numeric : undefined}
                className={"className" in col ? col.className : undefined}
              >
                {"srOnly" in col ? <span className="sr-only">{col.label}</span> : col.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>{children}</TableBody>
      </Table>
    </TableCard>
  );
}
