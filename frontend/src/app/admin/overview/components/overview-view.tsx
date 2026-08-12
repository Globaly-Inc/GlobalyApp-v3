"use client";

import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchOverviewStats } from "../store/overview-slice";
import { STAT_CARDS } from "../const";
import { StatCard } from "./stat-card";
import { FeatureUsagePanel } from "./feature-usage-panel";

export function OverviewView() {
  const dispatch = useAppDispatch();
  const { stats, status } = useAppSelector((state) => state.overview);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchOverviewStats());
  }, [dispatch]);

  const loading = status === "loading" && !stats;

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Platform overview and key metrics.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {STAT_CARDS.map((config) => (
          <StatCard key={config.key} config={config} value={stats?.[config.key]} loading={loading} />
        ))}
      </div>

      <FeatureUsagePanel />
    </div>
  );
}
