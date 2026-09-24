"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The feature's one table shell — used for the enquiry list and, inside the detail dialog,
 * for that enquiry's recipients. Same markup and palette as the Other Services screen's
 * table, so the two monitoring pages read as one system.
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
  head: readonly string[];
  rows: React.ReactNode[][];
  emptyText?: string;
  onRowClick?: (index: number) => void;
  minWidth?: string;
}>) {
  if (status === "loading") {
    return (
      <div className="flex justify-center rounded-lg border border-border bg-card py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (status === "failed") {
    return (
      <div className="rounded-lg border border-border bg-card py-12 text-center text-sm text-muted-foreground">
        Couldn&apos;t load this list.
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card py-12 text-center text-sm text-muted-foreground">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className={cn("w-full text-sm", minWidth)}>
        <thead className="border-b border-border bg-muted/40">
          <tr>
            {head.map((h) => (
              <th
                key={h}
                className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              onClick={onRowClick ? () => onRowClick(i) : undefined}
              className={cn(
                "border-b border-border last:border-0",
                onRowClick && "cursor-pointer transition-colors hover:bg-muted/40",
              )}
            >
              {row.map((cell, j) => (
                <td key={j} className="max-w-[260px] truncate px-4 py-2.5 text-foreground">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
