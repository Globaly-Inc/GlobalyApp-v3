"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { formatDate } from "@/app/personal/earn/services/utils";
import { AdminSegmentedTabs } from "../../../components/admin-segmented-tabs";
import {
  AdminMonitoringTable,
  AdminStatTile,
} from "../../../components/admin-monitoring-table";
import {
  fetchAmbassadorPrograms,
  fetchAmbassadorStats,
} from "../store/ambassador-programs-slice";
import type { AmbassadorProgramStatus } from "../apis/types";

const STATUS_FILTERS: Array<{ value: AmbassadorProgramStatus | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "draft", label: "Draft" },
  { value: "paused", label: "Paused" },
  { value: "archived", label: "Archived" },
];

const STATUS_STYLES: Record<AmbassadorProgramStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  active: "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300",
  paused: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  archived: "bg-muted text-muted-foreground",
};

/** Payout totals arrive as minor units; the backend never stores float money. */
function formatMinor(minor: number): string {
  return (minor / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Read-only oversight of ambassador programs across every business: who is
 * running one, how many ambassadors are live, and whether inquiries are being
 * answered or escalating.
 *
 * No actions. Editing another business's program or releasing someone's payout
 * are real powers that need their own audit trail; this answers "is the
 * programme working, and is the money moving".
 */
export function AmbassadorProgramsView() {
  const dispatch = useAppDispatch();
  const { programs, stats, total, listStatus, statsStatus, error } = useAppSelector(
    (state) => state.monitoringAmbassadorPrograms,
  );
  const [status, setStatus] = useState<AmbassadorProgramStatus | "all">("all");

  // Keyed on the serialized params rather than a bare mount effect, so React
  // Strict Mode's double-invoke does not fire two identical requests.
  const lastQueryRef = useRef<string>("");
  useEffect(() => {
    const params = status === "all" ? {} : { status };
    const key = JSON.stringify(params);
    if (lastQueryRef.current === key) return;
    lastQueryRef.current = key;
    dispatch(fetchAmbassadorPrograms(params));
  }, [dispatch, status]);

  useEffect(() => {
    dispatch(fetchAmbassadorStats());
  }, [dispatch]);

  const resolutionRate =
    stats && stats.inquiries.total > 0
      ? `${Math.round((stats.inquiries.resolved / stats.inquiries.total) * 100)}%`
      : "—";

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">Ambassadors</h1>
        <p className="mt-1 text-muted-foreground">
          Ambassador programs across all businesses — rosters, inquiry throughput and payouts.
        </p>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AdminStatTile
          label="Programs"
          value={statsStatus === "loading" ? "…" : String(stats?.programs.total ?? 0)}
          hint={`${stats?.programs.active ?? 0} active`}
        />
        <AdminStatTile
          label="Ambassadors"
          value={statsStatus === "loading" ? "…" : String(stats?.ambassadors.total ?? 0)}
          hint={`${stats?.ambassadors.active ?? 0} active`}
        />
        <AdminStatTile
          label="Inquiries"
          value={statsStatus === "loading" ? "…" : String(stats?.inquiries.total ?? 0)}
          hint={`${resolutionRate} resolved · ${stats?.inquiries.escalated ?? 0} escalated`}
        />
        <AdminStatTile
          label="Paid out"
          value={statsStatus === "loading" ? "…" : formatMinor(stats?.payouts.paid_minor ?? 0)}
          hint={`${stats?.payouts.total ?? 0} payouts · ${stats?.payouts.failed ?? 0} failed`}
        />
      </div>

      <AdminSegmentedTabs<AmbassadorProgramStatus | "all">
        value={status}
        onChange={setStatus}
        options={STATUS_FILTERS}
      />

      {error && listStatus === "failed" && <p className="mb-3 text-sm text-destructive">{error}</p>}

      <AdminMonitoringTable
        status={listStatus}
        emptyLabel="No ambassador programs yet."
        head={[
          "Program",
          "Business",
          "Status",
          "Ambassadors",
          "Pending applications",
          "Inquiries",
          "Resolved",
          "Created",
        ]}
        rows={programs.map((p) => [
          <span key="n" className="block truncate" title={p.slug}>
            {p.name}
          </span>,
          <span key="b" className="block truncate">
            {p.business_name ?? `Business ${p.business_id}`}
          </span>,
          <Badge key="s" variant="secondary" className={cn(STATUS_STYLES[p.status])}>
            {p.status}
          </Badge>,
          String(p.active_ambassadors),
          String(p.pending_applications),
          String(p.total_inquiries),
          String(p.resolved_inquiries),
          formatDate(p.created_at),
        ])}
      />

      {listStatus === "idle" && programs.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          Showing {programs.length} of {total}.
        </p>
      )}
    </div>
  );
}
