"use client";

import { EmptyState } from "@/components/ui/empty-state";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { Table, TableBody, TableCard, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/** A column header; `className` is applied to the header and every cell in that column (e.g. responsive hiding). */
export type RecordsColumn = string | { label: string; className?: string };

const labelOf = (col: RecordsColumn) => (typeof col === "string" ? col : col.label);
const classOf = (col: RecordsColumn | undefined) => (typeof col === "object" ? col.className : undefined);

/**
 * The feature's one table shell — used for the enquiry list and, inside the detail dialog,
 * for that enquiry's recipients. Built on the shared data-list table so the monitoring pages
 * read as one system.
 */
export function RecordsTable({
  status,
  head,
  rows,
  emptyText = "Nothing here yet.",
  onRowClick,
  minWidth = "min-w-[720px]",
}: Readonly<{
  status?: "idle" | "loading" | "failed";
  head: readonly RecordsColumn[];
  rows: React.ReactNode[][];
  emptyText?: string;
  onRowClick?: (index: number) => void;
  minWidth?: string;
}>) {
  if (status === "loading") return <ListSkeleton count={6} itemClassName="h-12" />;
  if (status === "failed") {
    return (
      <TableCard>
        <EmptyState compact title="Couldn't load this list." />
      </TableCard>
    );
  }
  if (rows.length === 0) {
    return (
      <TableCard className="border-dashed">
        <EmptyState compact title={emptyText} />
      </TableCard>
    );
  }

  return (
    <TableCard>
      <Table className={minWidth}>
        <TableHeader>
          <TableRow>
            {head.map((col) => (
              <TableHead key={labelOf(col)} className={classOf(col)}>
                {labelOf(col)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow
              key={i}
              onClick={onRowClick ? () => onRowClick(i) : undefined}
              onKeyDown={onRowClick ? (e) => e.key === "Enter" && onRowClick(i) : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              role={onRowClick ? "button" : undefined}
              className={cn(onRowClick && "cursor-pointer focus-visible:bg-muted/50 focus-visible:outline-none")}
            >
              {row.map((cell, j) => (
                <TableCell
                  key={j}
                  primary={j === 0}
                  className={cn("truncate text-foreground", j !== 0 && "max-w-[260px]", classOf(head[j]))}
                >
                  {cell}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableCard>
  );
}
