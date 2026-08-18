"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { AdminSegmentedTabs } from "../../../components/admin-segmented-tabs";
import {
  approveAdCampaign,
  fetchAdCampaigns,
  fetchAdReports,
  fetchAdStats,
  pauseAdCampaign,
  rejectAdCampaign,
} from "../store/ads-slice";
import type { AdCampaign, AdStatus } from "../apis/types";

const STATUS_FILTERS: Array<{ value: AdStatus | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "pending_review", label: "Pending review" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "rejected", label: "Rejected" },
  { value: "draft", label: "Draft" },
];

const STATUS_STYLES: Record<AdStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  pending_review: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  active: "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300",
  paused: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300",
  completed: "bg-muted text-muted-foreground",
};

const money = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });
const count = new Intl.NumberFormat("en-AU");

/** Budget 0 means unlimited, which is how V1 read it — not "no budget left". */
function formatBudget(campaign: AdCampaign): string {
  const spent = money.format(campaign.spent_amount);
  return campaign.budget_amount > 0 ? `${spent} / ${money.format(campaign.budget_amount)}` : `${spent} / ∞`;
}

/**
 * Ad-campaign moderation. Spec: V1's src/pages/admin/AdminAds.tsx — three verbs
 * (approve → active, reject with a reason, force-pause), a status filter, and the
 * pending-report count.
 *
 * Rejecting REQUIRES a reason: both the backend and the DB constraint refuse
 * without one, because V1 allowed a silent rejection that left the advertiser with
 * no way to find out why.
 */
export function AdsView() {
  const dispatch = useAppDispatch();
  const { campaigns, stats, reports, status, statsStatus, reportsStatus, error } = useAppSelector(
    (state) => state.marketingAds,
  );
  const [adStatus, setAdStatus] = useState<AdStatus | "all">("all");
  const [busyId, setBusyId] = useState<number | null>(null);

  // Keyed on the serialized params rather than a bare mount effect, so React
  // Strict Mode's double-invoke does not fire two identical requests.
  const lastQueryRef = useRef<string>("");
  useEffect(() => {
    const params = adStatus === "all" ? { limit: 100 } : { limit: 100, status: adStatus };
    const key = JSON.stringify(params);
    if (lastQueryRef.current === key) return;
    lastQueryRef.current = key;
    dispatch(fetchAdCampaigns(params));
  }, [dispatch, adStatus]);

  useEffect(() => {
    dispatch(fetchAdStats());
    dispatch(fetchAdReports());
  }, [dispatch]);

  async function run(id: number, action: Promise<unknown>) {
    setBusyId(id);
    try {
      await action;
      // Counters move with every verb, so they are refetched rather than guessed.
      dispatch(fetchAdStats());
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">Ads</h1>
        <p className="mt-1 text-muted-foreground">
          Ad campaigns across businesses — pending review, active spend, and reported ads.
        </p>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Total" value={statsStatus === "loading" ? "…" : count.format(stats?.total ?? 0)} />
        <Tile
          label="Awaiting review"
          value={statsStatus === "loading" ? "…" : count.format(stats?.pending_review ?? 0)}
          hint={`${count.format(stats?.rejected ?? 0)} rejected`}
        />
        <Tile
          label="Active"
          value={statsStatus === "loading" ? "…" : count.format(stats?.active ?? 0)}
          hint={`${count.format(stats?.paused ?? 0)} paused`}
        />
        <Tile
          label="Open reports"
          value={reportsStatus === "loading" ? "…" : count.format(stats?.pending_reports ?? reports.length)}
        />
      </div>

      <AdminSegmentedTabs<AdStatus | "all">
        value={adStatus}
        onChange={setAdStatus}
        options={STATUS_FILTERS}
      />

      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

      <Table
        status={status}
        head={["Campaign", "Business", "Model", "Budget", "Delivery", "Status", "Actions"]}
        empty="No ad campaigns yet."
        rows={campaigns.map((c) => [
          <span key="n" className="block truncate" title={c.name}>
            {c.name}
          </span>,
          c.business_name ?? "—",
          <span key="m" className="uppercase text-xs font-medium">
            {c.cost_model} · {money.format(c.cost_per_unit)}
          </span>,
          <span key="b" className="tabular-nums">
            {formatBudget(c)}
          </span>,
          <span key="d" className="tabular-nums text-muted-foreground">
            {count.format(c.impressions_count)} views · {count.format(c.leads_count)} leads
          </span>,
          <span key="s" className="flex flex-col gap-1">
            <Badge variant="secondary" className={cn(STATUS_STYLES[c.status])}>
              {c.status.replace("_", " ")}
            </Badge>
            {c.rejection_reason && (
              <span className="text-xs text-muted-foreground" title={c.rejection_reason}>
                {c.rejection_reason}
              </span>
            )}
          </span>,
          <Actions
            key="a"
            campaign={c}
            busy={busyId === c.id}
            onApprove={() => run(c.id, dispatch(approveAdCampaign(c.id)))}
            onReject={(reason) => run(c.id, dispatch(rejectAdCampaign({ id: c.id, reason })))}
            onPause={() => run(c.id, dispatch(pauseAdCampaign(c.id)))}
          />,
        ])}
      />

      {reports.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-lg font-semibold text-foreground">Open reports</h2>
          <Table
            status={reportsStatus}
            head={["Campaign", "Business", "Reason", "Details", "Reported"]}
            empty="No open reports."
            rows={reports.map((r) => [
              r.campaign_name ?? `#${r.campaign_id}`,
              r.business_name ?? "—",
              <span key="r" className="capitalize">
                {r.reason}
              </span>,
              r.details ?? "—",
              new Date(r.created_at).toLocaleDateString(),
            ])}
          />
        </div>
      )}
    </div>
  );
}

interface ActionsProps {
  campaign: AdCampaign;
  busy: boolean;
  onApprove: () => void;
  onReject: (reason: string) => void;
  onPause: () => void;
}

function Actions({ campaign, busy, onApprove, onReject, onPause }: Readonly<ActionsProps>) {
  if (busy) return <Loader2 className="h-4 w-4 animate-spin text-primary" />;

  return (
    <div className="flex flex-wrap gap-1.5">
      {campaign.status !== "active" && (
        <Button size="sm" variant="default" onClick={onApprove}>
          Approve
        </Button>
      )}
      {campaign.status === "active" && (
        <Button size="sm" variant="outline" onClick={onPause}>
          Pause
        </Button>
      )}
      {campaign.status !== "rejected" && (
        <Button
          size="sm"
          variant="destructive"
          onClick={() => {
            // A reason is mandatory, so an empty prompt cancels rather than sending
            // a request the backend will refuse.
            const reason = window.prompt("Why is this campaign rejected?")?.trim();
            if (reason) onReject(reason);
          }}
        >
          Reject
        </Button>
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
