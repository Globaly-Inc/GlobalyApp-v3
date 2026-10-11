"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCard, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Order } from "../apis";
import { STATUS_LABELS, STATUS_VARIANT } from "../const";
import { formatDate, formatMoney } from "../utils";

/**
 * Every row links to its order detail.
 *
 * V2 rendered both order tabs and neither row went anywhere — `/personal/services/orders/:id` existed and was
 * unreachable from the list that should feed it. The title's link stretches over the whole row
 * (`after:inset-0`), so the row is the click target, on a phone too.
 */
export function OrderRow({ order }: Readonly<{ order: Order }>) {
  // The thread is the only thing a row can usefully surface now that nothing needs confirming.
  const flag = order.message_count > 0 ? `${order.message_count} message${order.message_count === 1 ? "" : "s"}` : null;

  return (
    <TableRow className="group relative cursor-pointer has-[a:focus-visible]:bg-muted/50">
      <TableCell primary>
        <Link
          href={`/personal/earn/services/orders/${order.id}`}
          className="block truncate font-medium text-foreground outline-none after:absolute after:inset-0"
        >
          {order.listing_title}
        </Link>
        <p className="truncate text-xs text-muted-foreground">
          {order.role === "buyer" ? "from" : "for"} {order.counterparty_name}
          <span className="md:hidden"> · {formatDate(order.created_at)}</span>
        </p>
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={STATUS_VARIANT[order.status]} className="shrink-0">
            {STATUS_LABELS[order.status]}
          </Badge>
          {flag && (
            <Badge variant="outline" className="shrink-0">
              {flag}
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="hidden text-muted-foreground md:table-cell">{formatDate(order.created_at)}</TableCell>
      <TableCell numeric className="font-semibold text-foreground">
        {formatMoney(order.amount_minor, order.currency)}
      </TableCell>
      <TableCell className="pl-0">
        <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
      </TableCell>
    </TableRow>
  );
}

/** Purchases and received orders share one table shape. */
export function OrdersTable({ orders }: Readonly<{ orders: Order[] }>) {
  return (
    <TableCard>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Service</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden md:table-cell">Date</TableHead>
            <TableHead numeric>Amount</TableHead>
            <TableHead className="w-px">
              <span className="sr-only">Open</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => (
            <OrderRow key={order.id} order={order} />
          ))}
        </TableBody>
      </Table>
    </TableCard>
  );
}
