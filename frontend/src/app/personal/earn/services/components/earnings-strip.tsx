"use client";

import { Skeleton } from "@/components/ui/skeleton";
import type { Summary } from "../apis";
import { formatMoney } from "../utils";
import { SectionError } from "./section-error";

/**
 * The money story, without overstating it.
 *
 * "Held" is the value of paid-but-unconfirmed orders and "Confirmed" is completed orders. Neither is money in
 * the seller's hands — there is no Connect account and no transfer in this phase — so the strip says so
 * outright rather than letting a seller read "$450" as a balance. Totals are per currency and never summed
 * across them, because nothing here converts.
 */
export function EarningsStrip({
  summary,
  status,
  error,
  onRetry,
}: Readonly<{
  summary: Summary | null;
  status: "idle" | "loading" | "failed";
  error: string | null;
  onRetry: () => void;
}>) {
  if (status === "failed") return <SectionError message={error} onRetry={onRetry} />;

  if (!summary) {
    return (
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[76px] rounded-lg" />
        ))}
      </div>
    );
  }

  const totalOrders = summary.received_count;
  // No orders in any currency yet — one zeroed AUD row reads better than an empty strip.
  const buckets = summary.totals.length
    ? summary.totals
    : [{ currency: "AUD" as const, held_minor: 0, refunded_minor: 0, orders_count: 0 }];

  return (
    <div className="space-y-2">
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile
          label="Payment held"
          hint="Paid by the buyer"
          values={buckets.map((b) => formatMoney(b.held_minor, b.currency))}
        />
        <Tile
          label="Refunded"
          hint="Returned to buyers"
          values={buckets.map((b) => formatMoney(b.refunded_minor, b.currency))}
        />
        <Tile label="Orders received" values={[String(totalOrders)]} />
      </div>
      {!summary.payouts_live && (
        // Stated plainly. A seller who reads these as earnings already in their bank is a worse failure than
        // an extra line of copy.
        <p className="text-xs text-muted-foreground">
          These are order values, not payouts. Withdrawing your earnings isn&apos;t available yet.
        </p>
      )}
    </div>
  );
}

function Tile({
  label,
  hint,
  values,
}: Readonly<{ label: string; hint?: string; values: string[] }>) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        {values.map((v) => (
          <span key={v} className="text-lg font-semibold tabular-nums text-foreground">
            {v}
          </span>
        ))}
      </div>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
