"use client";

import { useEffect, useRef } from "react";
import { Activity, BarChart3, Bot, Building2, Cpu, ShieldCheck, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchDashboard, fetchSiteAccess } from "../store/overview-slice";
import { EXTRACTION_STATUS_LABELS, PRESETS, USER_CATEGORY_LABELS } from "../const";
import { formatStatValue, totalActivity } from "../utils";
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
    <PageBody>
      <PageHeader title={<><BarChart3 /> Analytics dashboard</>} subtitle="Platform-wide usage statistics and feature adoption">
        <ToggleGroup
          aria-label="Period"
          value={[preset]}
          // Re-clicking the active period empties the value; refetch it anyway, like the old buttons did.
          onValueChange={(next) => dispatch(fetchDashboard((next[0] ?? preset) as typeof preset))}
        >
          {PRESETS.map((p) => (
            <ToggleGroupItem key={p.value} value={p.value} size="sm">
              {p.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </PageHeader>

      {/* Summary stats — 6 cards across 2 rows on mobile, 3-per-row on lg, 6 on xl */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Businesses"
          icon={Building2}
          value={formatStatValue(data?.summary.total_businesses)}
          hint={`${formatStatValue(data?.summary.active_businesses)} active`}
          loading={loading}
        />
        <StatCard
          label="Users"
          icon={Users}
          value={formatStatValue(data?.summary.total_users)}
          hint={data ? `${personalCount} personal · ${businessCount} business` : "Registered accounts"}
          loading={loading}
        />
        <StatCard
          label="Admins"
          icon={ShieldCheck}
          value={formatStatValue(data?.summary.total_admins)}
          hint="Platform administrators"
          loading={loading}
        />
        <StatCard
          label="AI sessions"
          icon={Bot}
          value={formatStatValue(aiSessions?.count)}
          hint={aiSessions ? `+${aiSessions.last_week} this week` : "Chat sessions"}
          loading={loading}
        />
        <StatCard
          label="Extraction jobs"
          icon={Cpu}
          value={formatStatValue(data?.summary.total_extraction_jobs)}
          hint={data ? `${extractionActive} active` : "Total jobs"}
          loading={loading}
        />
        <StatCard
          label="Total activity"
          icon={Activity}
          value={formatStatValue(data ? totalActivity(data.feature_usage) : null)}
          hint="Records across all features"
          loading={loading}
        />
      </div>

      {/* Growth charts */}
      <div className="grid gap-6 md:grid-cols-2">
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
          color="var(--chart-2)"
          loading={loading}
        />
      </div>

      <div>
        <GrowthChart
          title="Activity over time"
          points={data?.growth.activity ?? []}
          days={days}
          color="var(--chart-4)"
          loading={loading}
          wide
        />
      </div>

      {/* User & extraction breakdown side-by-side */}
      {data && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Users by account type</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-2">
              {data.user_breakdown.by_category.map(({ category, count }) => (
                <div key={category} className="flex items-center justify-between text-sm">
                  <span className="capitalize">{USER_CATEGORY_LABELS[category] ?? category}</span>
                  <span className="font-semibold tabular-nums">{count.toLocaleString()}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Extraction jobs by status</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-2">
              {data.extraction.by_status.map(({ status: s, count }) => (
                <div key={s} className="flex items-center justify-between text-sm">
                  <span>{EXTRACTION_STATUS_LABELS[s] ?? s}</span>
                  <span className="font-semibold tabular-nums">{count.toLocaleString()}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {data && <FeatureUsagePanel features={data.feature_usage} />}
      {data && <RecentSignupsSection signups={data.recent_signups} />}

      <SiteAccessCard />
    </PageBody>
  );
}
