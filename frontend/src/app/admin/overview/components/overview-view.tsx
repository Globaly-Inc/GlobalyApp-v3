"use client";

import { useEffect, useRef } from "react";
import { Activity, Building2, TrendingUp, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchDashboard, fetchSiteAccess } from "../store/overview-slice";
import { PRESETS } from "../const";
import { formatStatValue, mostUsedFeature, totalActivity } from "../utils";
import { StatCard } from "./stat-card";
import { GrowthChart } from "./growth-chart";
import { FeatureUsagePanel } from "./feature-usage-panel";
import { SiteAccessCard } from "./site-access-card";

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
  const topFeature = mostUsedFeature(data?.feature_usage ?? []);

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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Active businesses"
          icon={Building2}
          value={formatStatValue(data?.summary.active_businesses)}
          sub={`of ${formatStatValue(data?.summary.total_businesses)} total`}
          loading={loading}
        />
        <StatCard
          label="Total users"
          icon={Users}
          value={formatStatValue(data?.summary.total_users)}
          sub="Registered accounts"
          loading={loading}
        />
        <StatCard
          label="Most used feature"
          icon={TrendingUp}
          value={topFeature?.label ?? "—"}
          sub={`${formatStatValue(topFeature?.count)} records`}
          loading={loading}
        />
        <StatCard
          label="Total activity"
          icon={Activity}
          value={formatStatValue(data ? totalActivity(data.feature_usage) : null)}
          sub="Records across features"
          loading={loading}
        />
      </div>

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

      {data && <FeatureUsagePanel features={data.feature_usage} />}

      <SiteAccessCard />
    </div>
  );
}
