"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { AdminSegmentedTabs } from "../../../../components/admin-segmented-tabs";
import {
  fetchApplicationChargeStats,
  fetchApplicationCharges,
  refundApplicationCharge,
  waiveApplicationCharge,
} from "../store/application-charges-slice";
import type { ApplicationCharge, ChargeStatus } from "../apis/types";

const STATUS_FILTERS: Array<{ value: ChargeStatus | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "charged", label: "Charged" },
  { value: "waived", label: "Waived" },
  { value: "refunded", label: "Refunded" },
];

const STATUS_STYLES: Record<ChargeStatus, string> = {
  charged: "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300",
  waived: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300",
  refunded: "bg-purple-100 text-purple-800 dark:bg-purple-500/15 dark:text-purple-300",
};

const count = new Intl.NumberFormat("en-AU");

function formatDate(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleDateString();
}

/**
 * Per-application credit charges. Spec: V1's src/pages/admin/AdminApplicationCharges.tsx
 * — list, status filter, waive, and refund-with-credit-back.
 *
 * Both verbs return the credits, and both are idempotent: the backend
 * compare-and-sets the status before it grants, so a double click cannot mint
 * credits (V1's refund granted first and updated after, un-transacted — press it
 * twice and you got the credits twice).
 */
export function ApplicationChargesView() {
  const dispatch = useAppDispatch();
  const { charges, stats, status, statsStatus, error } = useAppSelector(
    (state) => state.revenueApplicationCharges,
  );
  const [chargeStatus, setChargeStatus] = useState<ChargeStatus | "all">("all");
  const [busyId, setBusyId] = useState<number | null>(null);

  // Keyed on the serialized params rather than a bare mount effect, so React
  // Strict Mode's double-invoke does not fire two identical requests.
  const lastQueryRef = useRef<string>("");
  useEffect(() => {
    const params = chargeStatus === "all" ? { limit: 100 } : { limit: 100, status: chargeStatus };
    const key = JSON.stringify(params);
    if (lastQueryRef.current === key) return;
    lastQueryRef.current = key;
    dispatch(fetchApplicationCharges(params));
  }, [dispatch, chargeStatus]);

  useEffect(() => {
    dispatch(fetchApplicationChargeStats());
  }, [dispatch]);

  async function run(id: number, action: Promise<unknown>) {
    setBusyId(id);
    try {
      await action;
      // Retained credits move with every verb, so they are refetched rather than guessed.
      dispatch(fetchApplicationChargeStats());
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">Application Charges</h1>
        <p className="mt-1 text-muted-foreground">
          Credits charged to businesses for accepted student applications. Waiving or refunding returns
          the credits.
        </p>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Total" value={statsStatus === "loading" ? "…" : count.format(stats?.total ?? 0)} />
        <Tile label="Charged" value={statsStatus === "loading" ? "…" : count.format(stats?.charged ?? 0)} />
        <Tile
          label="Returned"
          value={
            statsStatus === "loading"
              ? "…"
              : count.format((stats?.waived ?? 0) + (stats?.refunded ?? 0))
          }
          hint={`${count.format(stats?.waived ?? 0)} waived · ${count.format(stats?.refunded ?? 0)} refunded`}
        />
        <Tile
          label="Credits retained"
          value={statsStatus === "loading" ? "…" : count.format(stats?.credits_charged ?? 0)}
          hint="charged rows only"
        />
      </div>

      <AdminSegmentedTabs<ChargeStatus | "all">
        value={chargeStatus}
        onChange={setChargeStatus}
        options={STATUS_FILTERS}
      />

      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

      <Table
        status={status}
        head={["Student", "Business", "Application", "Credits", "Charged", "Status", "Actions"]}
        empty="No application charges yet."
        rows={charges.map((c) => [
          c.student_name ?? "—",
          <span key="b" className="block truncate" title={c.business_name ?? undefined}>
            {c.business_name ?? "—"}
          </span>,
          <span key="a" className="tabular-nums text-muted-foreground">
            #{c.application_id}
          </span>,
          <span key="c" className="tabular-nums">
            {count.format(c.credits_charged)}
          </span>,
          formatDate(c.charged_at),
          <Badge key="s" variant="secondary" className={cn(STATUS_STYLES[c.status])}>
            {c.status}
          </Badge>,
          <Actions
            key="x"
            charge={c}
            busy={busyId === c.id}
            onWaive={() => run(c.id, dispatch(waiveApplicationCharge(c.id)))}
            onRefund={() => run(c.id, dispatch(refundApplicationCharge(c.id)))}
          />,
        ])}
      />
    </div>
  );
}

interface ActionsProps {
  charge: ApplicationCharge;
  busy: boolean;
  onWaive: () => void;
  onRefund: () => void;
}

function Actions({ charge, busy, onWaive, onRefund }: Readonly<ActionsProps>) {
  if (busy) return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
  // Only a `charged` row can be voided — the backend answers 409 otherwise, so the
  // buttons are not offered rather than offered and refused.
  if (charge.status !== "charged") {
    return <span className="text-xs text-muted-foreground">Credits returned</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      <Button size="sm" variant="outline" onClick={onWaive}>
        Waive
      </Button>
      <Button size="sm" variant="destructive" onClick={onRefund}>
        Refund
      </Button>
    </div>
  );
}

function Tile({ label, value, hint }: Readonly<{ label: string; value: string; hint?: string }>) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Table({
  status,
  head,
  rows,
  empty,
}: Readonly<{
  status: "idle" | "loading" | "failed";
  head: string[];
  rows: React.ReactNode[][];
  empty: string;
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
        {empty}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full min-w-[880px] text-sm">
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
            <tr key={i} className="border-b border-border last:border-0">
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
