"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { AdminSegmentedTabs } from "../../../components/admin-segmented-tabs";
import {
  approveScholarship,
  fetchScholarshipStats,
  fetchScholarships,
  rejectScholarship,
  setScholarshipFeatured,
  setScholarshipPublished,
} from "../store/scholarships-slice";
import type { ReviewStatus, Scholarship } from "../apis/types";

const STATUS_FILTERS: Array<{ value: ReviewStatus | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

const STATUS_STYLES: Record<ReviewStatus, string> = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  approved: "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300",
};

function formatDeadline(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleDateString();
}

/**
 * Scholarship moderation: submissions arrive `pending`, an admin approves (and
 * optionally publishes) or rejects with a note.
 *
 * Approve and reject are the only verbs that move review_status — publish and
 * feature are separate on purpose, so an approved listing can be pulled from the
 * directory without being marked rejected. A rejected listing cannot be published
 * at all; the backend answers 400 and the button is not offered.
 */
export function ScholarshipsView() {
  const dispatch = useAppDispatch();
  const { scholarships, stats, status, statsStatus, error } = useAppSelector(
    (state) => state.monitoringScholarships,
  );
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus | "all">("all");
  const [busyId, setBusyId] = useState<number | null>(null);

  // Keyed on the serialized params rather than a bare mount effect, so React
  // Strict Mode's double-invoke does not fire two identical requests.
  const lastQueryRef = useRef<string>("");
  useEffect(() => {
    const params = reviewStatus === "all" ? { limit: 100 } : { limit: 100, review_status: reviewStatus };
    const key = JSON.stringify(params);
    if (lastQueryRef.current === key) return;
    lastQueryRef.current = key;
    dispatch(fetchScholarships(params));
  }, [dispatch, reviewStatus]);

  useEffect(() => {
    dispatch(fetchScholarshipStats());
  }, [dispatch]);

  async function run(id: number, action: Promise<unknown>) {
    setBusyId(id);
    try {
      await action;
      // Counters move with every verb, so they are refetched rather than guessed.
      dispatch(fetchScholarshipStats());
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">Scholarships</h1>
        <p className="mt-1 text-muted-foreground">
          Review submitted scholarships, then publish or feature the ones that pass.
        </p>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Total" value={statsStatus === "loading" ? "…" : String(stats?.total ?? 0)} />
        <Tile
          label="Awaiting review"
          value={statsStatus === "loading" ? "…" : String(stats?.pending ?? 0)}
          hint={`${stats?.rejected ?? 0} rejected`}
        />
        <Tile
          label="Published"
          value={statsStatus === "loading" ? "…" : String(stats?.published ?? 0)}
          hint={`${stats?.approved ?? 0} approved`}
        />
        <Tile label="Featured" value={statsStatus === "loading" ? "…" : String(stats?.featured ?? 0)} />
      </div>

      <AdminSegmentedTabs<ReviewStatus | "all">
        value={reviewStatus}
        onChange={setReviewStatus}
        options={STATUS_FILTERS}
      />

      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

      <Table
        status={status}
        head={["Scholarship", "Provider", "Country", "Deadline", "Review", "Visibility", "Actions"]}
        rows={scholarships.map((s) => [
          <span key="t" className="block truncate" title={s.title}>
            {s.title}
          </span>,
          s.provider_name ?? "—",
          s.country ?? "—",
          formatDeadline(s.deadline),
          <Badge key="r" variant="secondary" className={cn(STATUS_STYLES[s.review_status])}>
            {s.review_status}
          </Badge>,
          <span key="v" className="text-muted-foreground">
            {s.is_published ? "Published" : "Hidden"}
            {s.is_featured ? " · Featured" : ""}
          </span>,
          <Actions
            key="a"
            scholarship={s}
            busy={busyId === s.id}
            onApprove={(publish) => run(s.id, dispatch(approveScholarship({ id: s.id, publish })))}
            onReject={(note) => run(s.id, dispatch(rejectScholarship({ id: s.id, note })))}
            onPublish={(isPublished) =>
              run(s.id, dispatch(setScholarshipPublished({ id: s.id, isPublished })))
            }
            onFeature={(isFeatured) =>
              run(s.id, dispatch(setScholarshipFeatured({ id: s.id, isFeatured })))
            }
          />,
        ])}
      />
    </div>
  );
}

interface ActionsProps {
  scholarship: Scholarship;
  busy: boolean;
  onApprove: (publish: boolean) => void;
  onReject: (note?: string) => void;
  onPublish: (isPublished: boolean) => void;
  onFeature: (isFeatured: boolean) => void;
}

function Actions({ scholarship, busy, onApprove, onReject, onPublish, onFeature }: Readonly<ActionsProps>) {
  const s = scholarship;
  if (busy) return <Loader2 className="h-4 w-4 animate-spin text-primary" />;

  return (
    <div className="flex flex-wrap gap-1.5">
      {s.review_status !== "approved" && (
        <Button size="sm" variant="default" onClick={() => onApprove(true)}>
          Approve
        </Button>
      )}
      {s.review_status !== "rejected" && (
        <Button
          size="sm"
          variant="destructive"
          onClick={() => {
            const note = window.prompt("Why is this rejected? (optional)") ?? undefined;
            onReject(note);
          }}
        >
          Reject
        </Button>
      )}
      {/* Publishing a rejected listing is refused by the backend, so it is not offered. */}
      {s.review_status === "approved" && (
        <Button size="sm" variant="outline" onClick={() => onPublish(!s.is_published)}>
          {s.is_published ? "Unpublish" : "Publish"}
        </Button>
      )}
      <Button size="sm" variant="outline" onClick={() => onFeature(!s.is_featured)}>
        {s.is_featured ? "Unfeature" : "Feature"}
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
        No scholarships yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full min-w-[960px] text-sm">
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
