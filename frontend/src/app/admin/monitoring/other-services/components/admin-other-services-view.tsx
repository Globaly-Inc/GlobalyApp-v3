"use client";

import { useEffect, useRef, useState } from "react";
import { Briefcase } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar, SearchInput } from "@/components/ui/filter-bar";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableBody, TableCard, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { SectionTabs } from "@/components/section-tabs";
import { formatDate, formatMoney } from "@/app/personal/earn/services/utils";
import { STATUS_LABELS, STATUS_VARIANT } from "@/app/personal/earn/services/const";
import type { OrderStatus } from "@/app/personal/earn/services/apis";
import { fetchServiceListings, fetchServiceOrders, fetchServicesStats } from "../store/admin-other-services-slice";

type Tab = "listings" | "orders";
type Column = { label: string; className?: string; numeric?: boolean };

const LISTING_COLUMNS: Column[] = [
  { label: "Service" },
  { label: "Provider", className: "hidden md:table-cell" },
  { label: "Category", className: "hidden lg:table-cell" },
  { label: "Price", numeric: true },
  { label: "State" },
  { label: "Orders", numeric: true, className: "hidden md:table-cell" },
  { label: "Created", className: "hidden lg:table-cell" },
];

const ORDER_COLUMNS: Column[] = [
  { label: "Service" },
  { label: "Buyer", className: "hidden md:table-cell" },
  { label: "Provider", className: "hidden lg:table-cell" },
  { label: "Amount", numeric: true },
  { label: "Status" },
  { label: "Created", className: "hidden md:table-cell" },
];

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

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchServicesStats());
    dispatch(fetchServiceListings({}));
    dispatch(fetchServiceOrders({}));
  }, [dispatch]);

  return (
    <PageBody>
      <PageHeader
        title={<><Briefcase /> Other Services</>}
        subtitle="Peer-to-peer services individuals offer through Earn, and the orders placed against them."
      />

      <div className="grid gap-3 sm:grid-cols-3">
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

      <SectionTabs<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: "listings", label: `Listings (${listingsTotal})` },
          { value: "orders", label: `Orders (${ordersTotal})` },
        ]}
      />

      {tab === "listings" && (
        <>
          <FilterBar>
            <SearchInput
              placeholder="Search by title or provider email"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                dispatch(fetchServiceListings({ search: e.target.value || undefined }));
              }}
            />
            <span className="shrink-0 px-2 text-sm text-muted-foreground">
              {listingsTotal} listing{listingsTotal === 1 ? "" : "s"}
            </span>
          </FilterBar>
          <DataTable status={listingsStatus} columns={LISTING_COLUMNS} empty={listings.length === 0}>
            {listings.map((l) => (
              <TableRow key={l.id}>
                <TableCell primary>
                  <p className="truncate font-medium text-foreground">{l.title}</p>
                  {/* Fallbacks for the columns hidden on narrow screens. */}
                  <p className="truncate text-xs text-muted-foreground md:hidden">
                    {l.provider_name || l.provider_email} · {l.total_orders} · ★ {Number(l.avg_rating).toFixed(1)}
                  </p>
                  <p className="truncate text-xs text-muted-foreground lg:hidden">
                    {l.category_name} · {formatDate(l.created_at)}
                  </p>
                </TableCell>
                <TableCell className="hidden max-w-60 truncate md:table-cell" title={l.provider_email}>
                  {l.provider_name || l.provider_email}
                </TableCell>
                <TableCell className="hidden text-muted-foreground lg:table-cell">{l.category_name}</TableCell>
                <TableCell numeric>{formatMoney(l.price_minor, l.currency)}</TableCell>
                <TableCell>
                  <Badge variant={l.deleted_at ? "outline" : l.is_active ? "success" : "secondary"} className={cn(l.deleted_at && "text-muted-foreground")}>
                    {l.deleted_at ? "Deleted" : l.is_active ? "Active" : "Paused"}
                  </Badge>
                </TableCell>
                <TableCell numeric className="hidden text-muted-foreground md:table-cell">
                  {l.total_orders} · ★ {Number(l.avg_rating).toFixed(1)}
                </TableCell>
                <TableCell className="hidden text-muted-foreground lg:table-cell">{formatDate(l.created_at)}</TableCell>
              </TableRow>
            ))}
          </DataTable>
        </>
      )}

      {tab === "orders" && (
        <DataTable status={ordersStatus} columns={ORDER_COLUMNS} empty={orders.length === 0}>
          {orders.map((o) => (
            <TableRow key={o.id}>
              <TableCell primary>
                <p className="truncate font-medium text-foreground">{o.listing_title}</p>
                {/* Fallbacks for the columns hidden on narrow screens. */}
                <p className="truncate text-xs text-muted-foreground md:hidden">
                  Buyer {o.buyer_name} · {formatDate(o.created_at)}
                </p>
                <p className="truncate text-xs text-muted-foreground lg:hidden">Provider {o.provider_name}</p>
              </TableCell>
              <TableCell className="hidden md:table-cell">{o.buyer_name}</TableCell>
              <TableCell className="hidden lg:table-cell">{o.provider_name}</TableCell>
              <TableCell numeric>{formatMoney(o.amount_minor, o.currency)}</TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[o.status as OrderStatus]}>
                  {STATUS_LABELS[o.status as OrderStatus] ?? o.status}
                </Badge>
              </TableCell>
              <TableCell className="hidden text-muted-foreground md:table-cell">{formatDate(o.created_at)}</TableCell>
            </TableRow>
          ))}
        </DataTable>
      )}
    </PageBody>
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

function DataTable({
  status,
  columns,
  empty,
  children,
}: Readonly<{ status: "idle" | "loading" | "failed"; columns: Column[]; empty: boolean; children: React.ReactNode }>) {
  if (status === "loading") return <ListSkeleton count={6} itemClassName="h-12" />;
  if (status === "failed") return <EmptyState icon={Briefcase} title="Couldn't load this list." />;
  if (empty) return <EmptyState icon={Briefcase} title="Nothing here yet." />;

  return (
    <TableCard>
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead key={col.label} numeric={col.numeric} className={col.className}>
                {col.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>{children}</TableBody>
      </Table>
    </TableCard>
  );
}
