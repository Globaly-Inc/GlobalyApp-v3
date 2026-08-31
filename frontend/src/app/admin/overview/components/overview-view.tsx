"use client";

import { useEffect, useRef } from "react";
import { Activity, Bot, Building2, Cpu, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchDashboard, fetchSiteAccess } from "../store/overview-slice";
import { EXTRACTION_STATUS_LABELS, PRESETS, USER_CATEGORY_LABELS } from "../const";
import { formatStatValue, totalActivity } from "../utils";
import { StatCard } from "./stat-card";
import { GrowthChart } from "./growth-chart";
import { FeatureUsagePanel } from "./feature-usage-panel";
import { SiteAccessCard } from "./site-access-card";
import { RecentSignupsSection } from "./recent-signups-section";

export function OverviewView() {
  const dispatch = useAppDispatch();
  const { data, preset, status } = useAppSelector((state) => state.overview);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchDashboard("last30"));
    dispatch(fetchSiteAccess());
  }, [dispatch]);

  const loading = status === "loading" && !data;
  const days = PRESETS.find((p) => p.value === preset)?.days ?? 30;

  // Derived from feature_usage so they're always in sync with the feature panel
  const aiSessions = data?.feature_usage.find((f) => f.key === "chat_sessions");
  const extractionActive = data?.extraction.by_status
    .filter((s) => s.status === "pending" || s.status === "processing")
    .reduce((sum, s) => sum + s.count, 0) ?? 0;

  const personalCount = data?.user_breakdown.by_category.find((c) => c.category === "personal")?.count ?? 0;
  const businessCount = data?.user_breakdown.by_category.find((c) => c.category === "business")?.count ?? 0;

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">Analytics dashboard</h1>
        <p className="text-muted-foreground mt-1">Platform-wide usage statistics and feature adoption</p>
      </div>

      <div className="flex gap-2 mb-6">
        {PRESETS.map((p) => (
          <Button
            key={p.value}
            variant={preset === p.value ? "default" : "outline"}
            size="sm"
            onClick={() => dispatch(fetchDashboard(p.value))}
          >
            {p.label}
          </Button>
        ))}
      </div>

      {/* Summary stats — 6 cards across 2 rows on mobile, 3-per-row on lg, 6 on xl */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          label="Businesses"
          icon={Building2}
          value={formatStatValue(data?.summary.total_businesses)}
          sub={`${formatStatValue(data?.summary.active_businesses)} active`}
          loading={loading}
        />
        <StatCard
          label="Users"
          icon={Users}
          value={formatStatValue(data?.summary.total_users)}
          sub={data ? `${personalCount} personal · ${businessCount} business` : "Registered accounts"}
          loading={loading}
        />
        <StatCard
          label="Admins"
          icon={ShieldCheck}
          value={formatStatValue(data?.summary.total_admins)}
          sub="Platform administrators"
          loading={loading}
        />
        <StatCard
          label="AI sessions"
          icon={Bot}
          value={formatStatValue(aiSessions?.count)}
          sub={aiSessions ? `+${aiSessions.last_week} this week` : "Chat sessions"}
          loading={loading}
        />
        <StatCard
          label="Extraction jobs"
          icon={Cpu}
          value={formatStatValue(data?.summary.total_extraction_jobs)}
          sub={data ? `${extractionActive} active` : "Total jobs"}
          loading={loading}
        />
        <StatCard
          label="Total activity"
          icon={Activity}
          value={formatStatValue(data ? totalActivity(data.feature_usage) : null)}
          sub="Records across all features"
          loading={loading}
        />
      </div>

      {/* Growth charts */}
      <div className="grid gap-6 md:grid-cols-2 mt-6">
        <GrowthChart
          title="Business growth"
          points={data?.growth.businesses ?? []}
          days={days}
          color="var(--primary)"
          loading={loading}
        />
        <GrowthChart
          title="User growth"
          points={data?.growth.users ?? []}
          days={days}
          color="#16a34a"
          loading={loading}
        />
      </div>

      <div className="mt-6">
        <GrowthChart
          title="Activity over time"
          points={data?.growth.activity ?? []}
          days={days}
          color="#9333ea"
          loading={loading}
          wide
        />
      </div>

      {/* User & extraction breakdown side-by-side */}
      {data && (
        <div className="grid gap-6 md:grid-cols-2 mt-6">
          <div className="rounded-lg border border-border p-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Users by account type</h3>
            <div className="flex flex-col gap-2">
              {data.user_breakdown.by_category.map(({ category, count }) => (
                <div key={category} className="flex items-center justify-between text-sm">
                  <span className="capitalize">{USER_CATEGORY_LABELS[category] ?? category}</span>
                  <span className="font-semibold tabular-nums">{count.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border p-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Extraction jobs by status</h3>
            <div className="flex flex-col gap-2">
              {data.extraction.by_status.map(({ status: s, count }) => (
                <div key={s} className="flex items-center justify-between text-sm">
                  <span>{EXTRACTION_STATUS_LABELS[s] ?? s}</span>
                  <span className="font-semibold tabular-nums">{count.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {data && <FeatureUsagePanel features={data.feature_usage} />}
      {data && <RecentSignupsSection signups={data.recent_signups} />}

      <SiteAccessCard />
    </div>
  );
}
