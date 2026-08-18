"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { formatDate } from "@/app/personal/earn/services/utils";
import { AdminSegmentedTabs } from "../../../components/admin-segmented-tabs";
import { fetchEnquiries, fetchEnquiryStats } from "../store/enquiries-slice";
import type { EnquiryStatus } from "../apis/types";

const STATUS_FILTERS: Array<{ value: EnquiryStatus | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "viewed", label: "Viewed" },
  { value: "converted", label: "Converted" },
  { value: "closed", label: "Closed" },
];

const STATUS_STYLES: Record<EnquiryStatus, string> = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  viewed: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300",
  responded: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300",
  assigned: "bg-purple-100 text-purple-800 dark:bg-purple-500/15 dark:text-purple-300",
  converted: "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300",
  closed: "bg-muted text-muted-foreground",
};

/**
 * Read-only oversight of the enquiry funnel: how many leads arrive, how far they
 * fan out, and how many businesses pay to unlock them.
 *
 * No actions. Re-distributing or refunding someone's unlock are real powers that
 * need their own audit trail; this answers "is the monetised path working".
 */
export function EnquiriesView() {
  const dispatch = useAppDispatch();
  const { enquiries, stats, total, listStatus, statsStatus, error } = useAppSelector(
    (state) => state.monitoringEnquiries,
  );
  const [status, setStatus] = useState<EnquiryStatus | "all">("all");

  // Keyed on the serialized params rather than a bare mount effect, so React
  // Strict Mode's double-invoke does not fire two identical requests.
  const lastQueryRef = useRef<string>("");
  useEffect(() => {
    const params = status === "all" ? {} : { status };
    const key = JSON.stringify(params);
    if (lastQueryRef.current === key) return;
    lastQueryRef.current = key;
    dispatch(fetchEnquiries(params));
  }, [dispatch, status]);

  useEffect(() => {
    dispatch(fetchEnquiryStats());
  }, [dispatch]);

  const unlockRate =
    stats && stats.distributions_total > 0
      ? `${Math.round((stats.unlocks.total / stats.distributions_total) * 100)}%`
      : "—";

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">Enquiries</h1>
        <p className="mt-1 text-muted-foreground">
          Student enquiries, how far each one was distributed, and what businesses paid to unlock them.
        </p>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label="Enquiries"
          value={statsStatus === "loading" ? "…" : String(stats?.enquiries.total ?? 0)}
          hint={`${stats?.enquiries.last_7_days ?? 0} in the last 7 days`}
        />
        <Tile
          label="Distributions"
          value={statsStatus === "loading" ? "…" : String(stats?.distributions_total ?? 0)}
          hint="Leads offered to a business"
        />
        <Tile
          label="Unlocks"
          value={statsStatus === "loading" ? "…" : String(stats?.unlocks.total ?? 0)}
          hint={`${unlockRate} of distributions`}
        />
        <Tile
          label="Credits earned"
          value={statsStatus === "loading" ? "…" : String(stats?.unlocks.credits_spent ?? 0)}
          hint={`Digest queue: ${stats?.digest_queue.pending ?? 0} pending · ${stats?.digest_queue.failed ?? 0} failed`}
        />
      </div>

      <AdminSegmentedTabs<EnquiryStatus | "all">
        value={status}
        onChange={setStatus}
        options={STATUS_FILTERS}
      />

      {error && listStatus === "failed" && <p className="mb-3 text-sm text-destructive">{error}</p>}

      <Table
        status={listStatus}
        head={["Student", "Message", "Intake", "Status", "Distributed", "Unlocked", "Credits", "Created"]}
        rows={enquiries.map((e) => [
          <span key="s" className="block truncate" title={e.student_email}>
            {e.student_name || e.student_email}
          </span>,
          <span key="m" className="block truncate" title={e.message}>
            {e.message}
          </span>,
          [e.preferred_intake, e.preferred_year].filter(Boolean).join(" ") || "—",
          <Badge key="st" variant="secondary" className={cn(STATUS_STYLES[e.status])}>
            {e.status}
          </Badge>,
          String(e.distributed_to),
          String(e.unlocked_count),
          String(e.credits_earned),
          formatDate(e.created_at),
        ])}
      />

      {listStatus === "idle" && enquiries.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          Showing {enquiries.length} of {total}.
        </p>
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
        No enquiries yet.
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
