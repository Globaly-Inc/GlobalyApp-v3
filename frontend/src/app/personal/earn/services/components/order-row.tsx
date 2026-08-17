"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Order } from "../apis";
import { STATUS_LABELS, STATUS_STYLES } from "../const";
import { formatDate, formatMoney } from "../utils";

/**
 * Every row links to its order detail.
 *
 * V2 rendered both order tabs and neither row went anywhere — `/personal/services/orders/:id` existed and was
 * unreachable from the list that should feed it. The whole row is the link, so it works on a phone.
 */
export function OrderRow({ order }: Readonly<{ order: Order }>) {
  // The thread is the only thing a row can usefully surface now that nothing needs confirming.
  const flag = order.message_count > 0 ? `${order.message_count} message${order.message_count === 1 ? "" : "s"}` : null;

  return (
    <Link
      href={`/personal/earn/services/orders/${order.id}`}
      className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:bg-muted/50"
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium text-foreground">{order.listing_title}</span>
          <Badge variant="secondary" className={cn("shrink-0", STATUS_STYLES[order.status])}>
            {STATUS_LABELS[order.status]}
          </Badge>
          {flag && (
            <Badge variant="outline" className="shrink-0">
              {flag}
            </Badge>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {order.role === "buyer" ? "from" : "for"} {order.counterparty_name} · {formatDate(order.created_at)}
        </p>
      </div>

      <span className="shrink-0 font-semibold tabular-nums text-foreground">
        {formatMoney(order.amount_minor, order.currency)}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
