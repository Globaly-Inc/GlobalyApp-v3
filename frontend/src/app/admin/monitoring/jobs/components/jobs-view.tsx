"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { formatDate } from "@/app/personal/earn/services/utils";
import { AdminSegmentedTabs } from "../../../components/admin-segmented-tabs";
import { fetchAdminJobs, fetchAdminJobStats } from "../store/admin-jobs-slice";
import type { AdminJob, JobStatus } from "../apis/types";

const STATUS_FILTERS: Array<{ value: JobStatus | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "expired", label: "Expired" },
];

const STATUS_STYLES: Record<JobStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  open: "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300",
  closed: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300",
  expired: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
};

/** "Corner Lane Coffee", falling back to the scraped company_name. */
function employerOf(job: AdminJob): string {
  return job.business_name || job.company_name || "—";
}

function payOf(job: AdminJob): string {
  if (job.pay_min === null && job.pay_max === null) return "—";
  const currency = job.pay_currency ?? "";
  const range = [job.pay_min, job.pay_max].filter((v) => v !== null).join("–");
  return `${currency} ${range}${job.pay_unit ? `/${job.pay_unit}` : ""}`.trim();
}

function locationOf(job: AdminJob): string {
  if (job.is_remote) return "Remote";
  return [job.location_city, job.country_name].filter(Boolean).join(", ") || "—";
}

/**
 * Read-only oversight of the jobs board: what is posted, by whom, and how much
 * traffic and application volume each posting draws.
 *
 * No actions. Featuring or closing another business's posting is a real power that
 * needs its own audit trail; this answers "is the board healthy".
 *
 * Note: these are job POSTINGS, not extraction jobs — for extraction job health
 * see Data · All Extractions.
 */
export function JobsView() {
  const dispatch = useAppDispatch();
  const { jobs, stats, total, listStatus, statsStatus, error } = useAppSelector(
    (state) => state.monitoringJobs,
  );
  const [status, setStatus] = useState<JobStatus | "all">("all");

  // Keyed on the serialized params rather than a bare mount effect, so React
  // Strict Mode's double-invoke does not fire two identical requests.
  const lastQueryRef = useRef<string>("");
  useEffect(() => {
    const params = status === "all" ? {} : { status };
    const key = JSON.stringify(params);
    if (lastQueryRef.current === key) return;
    lastQueryRef.current = key;
    dispatch(fetchAdminJobs(params));
  }, [dispatch, status]);

  useEffect(() => {
    dispatch(fetchAdminJobStats());
  }, [dispatch]);

  const applicationsPerOpen =
    stats && stats.jobs.open > 0
      ? (stats.applications.total / stats.jobs.open).toFixed(1)
      : "—";

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">Jobs</h1>
        <p className="mt-1 text-muted-foreground">
          Job postings across all businesses, with their reach and application volume.
        </p>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label="Postings"
          value={statsStatus === "loading" ? "…" : String(stats?.jobs.total ?? 0)}
          hint={`${stats?.jobs.draft ?? 0} draft`}
        />
        <Tile
          label="Open"
          value={statsStatus === "loading" ? "…" : String(stats?.jobs.open ?? 0)}
          hint={`${stats?.jobs.closed ?? 0} closed · ${stats?.jobs.expired ?? 0} expired`}
        />
        <Tile
          label="Applications"
          value={statsStatus === "loading" ? "…" : String(stats?.applications.total ?? 0)}
          hint={`${stats?.applications.last_7_days ?? 0} in the last 7 days`}
        />
        <Tile
          label="Per open posting"
          value={statsStatus === "loading" ? "…" : applicationsPerOpen}
          hint="Applications per open job"
        />
      </div>

      <AdminSegmentedTabs<JobStatus | "all">
        value={status}
        onChange={setStatus}
        options={STATUS_FILTERS}
      />

      {error && listStatus === "failed" && <p className="mb-3 text-sm text-destructive">{error}</p>}

      <Table
        status={listStatus}
        head={["Title", "Employer", "Type", "Location", "Pay", "Status", "Views", "Applicants", "Created"]}
        rows={jobs.map((job) => [
          <span key="t" className="block truncate" title={job.title}>
            {job.title}
            {job.is_featured && (
              <Badge variant="secondary" className="ml-2 align-middle text-[10px]">
                Featured
              </Badge>
            )}
          </span>,
          <span key="e" className="block truncate">
            {employerOf(job)}
          </span>,
          job.job_type ?? "—",
          locationOf(job),
          payOf(job),
          <Badge key="st" variant="secondary" className={cn(STATUS_STYLES[job.status])}>
            {job.status}
          </Badge>,
          String(job.views_count),
          String(job.applications_count),
          formatDate(job.created_at),
        ])}
      />

      {listStatus === "idle" && jobs.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          Showing {jobs.length} of {total}.
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
        No job postings yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full min-w-[980px] text-sm">
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
