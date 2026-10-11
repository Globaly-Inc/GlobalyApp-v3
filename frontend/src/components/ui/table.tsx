"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * GlobalyOS-V2 table (mockup `.tbl`): a muted header row with muted labels, roomy cells, tabular figures.
 * The table itself is frameless so it drops into any container; wrap it in `TableCard` for the bordered
 * card a data list uses.
 */
function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div data-slot="table-container" className="relative w-full overflow-x-auto">
      <table data-slot="table" className={cn("w-full caption-bottom text-sm tabular-nums", className)} {...props} />
    </div>
  )
}

/** The bordered card a data list's table sits in. */
function TableCard({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="table-card" className={cn("overflow-hidden rounded-lg border border-border bg-card", className)} {...props} />
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead data-slot="table-header" className={cn("bg-muted/60 [&_tr]:border-b [&_tr]:hover:bg-transparent", className)} {...props} />
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" className={cn("[&_tr:last-child]:border-0", className)} {...props} />
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn("border-b border-border transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted", className)}
      {...props}
    />
  )
}

type CellProps = { /** Right-aligned, for counts and amounts. */ numeric?: boolean }

function TableHead({ className, numeric, ...props }: React.ComponentProps<"th"> & CellProps) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-11 px-4 text-left align-middle font-medium whitespace-nowrap text-muted-foreground [&:has([role=checkbox])]:pr-0",
        numeric && "text-right",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, numeric, ...props }: React.ComponentProps<"td"> & CellProps) {
  return (
    <td
      data-slot="table-cell"
      className={cn("px-4 py-3 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0", numeric && "text-right", className)}
      {...props}
    />
  )
}

export { Table, TableCard, TableHeader, TableBody, TableRow, TableHead, TableCell }
