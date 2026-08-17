"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { AdminSegmentedTabs } from "../../../components/admin-segmented-tabs";
import { formatDate, formatMoney } from "@/app/personal/earn/services/utils";
import { STATUS_LABELS, STATUS_STYLES } from "@/app/personal/earn/services/const";
import type { OrderStatus } from "@/app/personal/earn/services/apis";
import { fetchServiceListings, fetchServiceOrders, fetchServicesStats } from "../store/admin-other-services-slice";

type Tab = "listings" | "orders";

/**
 * Read-only oversight of the services marketplace.
 *
 * No moderation actions: pausing someone's listing or forcing a refund are real powers that need their own
 * audit trail and permission story. This answers "what is on the marketplace and what is being bought".
 */
export function AdminOtherServicesView() {
  const dispatch = useAppDispatch();
  const { stats, listings, orders, listingsStatus, ordersStatus, listingsTotal, ordersTotal } = useAppSelector(
    (state) => state.monitoringOtherServices,
  );
  const [tab, setTab] = useState<Tab>("listings");
  const [search, setSearch] = useState("");

  useEffect(() => {
    dispatch(fetchServicesStats());
    dispatch(fetchServiceListings({}));
    dispatch(fetchServiceOrders({}));
  }, [dispatch]);

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">Other Services</h1>
        <p className="mt-1 text-muted-foreground">
          Peer-to-peer services individuals offer through Earn, and the orders placed against them.
        </p>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Tile label="Listings" value={String(stats?.listings.total ?? 0)} hint={`${stats?.listings.active ?? 0} active · ${stats?.listings.paused ?? 0} paused`} />
        <Tile
          label="Payment held"
          // One figure per currency, never summed — nothing in this feature converts between them.
          value={(stats?.orders ?? []).map((o) => formatMoney(o.held_minor, o.currency)).join("  ") || "—"}
          hint="Paid by the buyer"
        />
        <Tile
          label="Completed"
          value={(stats?.orders ?? []).map((o) => formatMoney(o.completed_minor, o.currency)).join("  ") || "—"}
          hint="Both parties confirmed"
        />
      </div>

      <AdminSegmentedTabs<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: "listings", label: `Listings (${listingsTotal})` },
          { value: "orders", label: `Orders (${ordersTotal})` },
        ]}
      />

      {tab === "listings" && (
        <>
          <Input
            className="mb-3 max-w-sm"
            placeholder="Search by title or provider email"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              dispatch(fetchServiceListings({ search: e.target.value || undefined }));
            }}
          />
          <Table
            status={listingsStatus}
            head={["Service", "Provider", "Category", "Price", "State", "Orders", "Created"]}
            rows={listings.map((l) => [
              l.title,
              <span key="p" className="block truncate" title={l.provider_email}>
                {l.provider_name || l.provider_email}
              </span>,
              l.category_name,
              formatMoney(l.price_minor, l.currency),
              <Badge
                key="s"
                variant="secondary"
                className={cn(
                  l.deleted_at
                    ? "bg-muted text-muted-foreground/70"
                    : l.is_active
                      ? "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {l.deleted_at ? "Deleted" : l.is_active ? "Active" : "Paused"}
              </Badge>,
              `${l.total_orders} · ★ ${Number(l.avg_rating).toFixed(1)}`,
              formatDate(l.created_at),
            ])}
          />
        </>
      )}

      {tab === "orders" && (
        <Table
          status={ordersStatus}
          head={["Service", "Buyer", "Provider", "Amount", "Status", "Created"]}
          rows={orders.map((o) => [
            o.listing_title,
            o.buyer_name,
            o.provider_name,
            formatMoney(o.amount_minor, o.currency),
            <Badge key="s" variant="secondary" className={cn(STATUS_STYLES[o.status as OrderStatus])}>
              {STATUS_LABELS[o.status as OrderStatus] ?? o.status}
            </Badge>,
            formatDate(o.created_at),
          ])}
        />
      )}
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
}: Readonly<{ status: "idle" | "loading" | "failed"; head: string[]; rows: React.ReactNode[][] }>) {
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
        Nothing here yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="border-b border-border bg-muted/40">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border last:border-0">
              {row.map((cell, j) => (
                <td key={j} className="max-w-[240px] truncate px-4 py-2.5 text-foreground">
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
