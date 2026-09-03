"use client";

import { useEffect, useRef, useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Combobox } from "@/components/combobox";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchChart } from "../store/credits-ledger-slice";
import { CHART_METRIC_OPTIONS, CHART_COLORS } from "../const";
import type { ChartMetric, ChartSeries } from "../apis/types";

const DAYS_OPTIONS = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
] as const;

/** Pivot series[] into recharts row format: [{ date, seriesKey1: val, seriesKey2: val }] */
function pivotSeries(series: ChartSeries[], days: number): Record<string, string | number>[] {
  const map = new Map<string, Record<string, string | number>>();
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    map.set(key, { date: key.slice(5) }); // MM-DD display
  }
  for (const s of series) {
    for (const pt of s.data) {
      const row = map.get(pt.date);
      if (row) row[s.key] = pt.value;
    }
  }
  return Array.from(map.values());
}

export function CreditUsageChart() {
  const dispatch = useAppDispatch();
  const { chartSeries, chartStatus } = useAppSelector((s) => s.creditsLedger);
  const [metric, setMetric] = useState<ChartMetric>("total");
  const [days, setDays] = useState<7 | 30 | 90>(30);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchChart({ metric, days }));
  }, [dispatch]); // eslint-disable-line react-hooks/exhaustive-deps

  const isMount = useRef(true);
  useEffect(() => {
    if (isMount.current) { isMount.current = false; return; }
    dispatch(fetchChart({ metric, days }));
  }, [dispatch, metric, days]);

  const loading = chartStatus === "loading";
  const data = pivotSeries(chartSeries, days);

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Credit Usage</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Platform-wide credit consumption over time</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Days toggle */}
          <div className="flex rounded-lg border overflow-hidden text-xs">
            {DAYS_OPTIONS.map((opt) => (
              <button
                key={opt.days}
                type="button"
                onClick={() => setDays(opt.days)}
                className={`px-3 py-1.5 font-medium transition-colors cursor-pointer ${
                  days === opt.days
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {/* Metric selector */}
          <div className="flex flex-col gap-0 w-44">
            <Combobox
              options={CHART_METRIC_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              value={metric}
              onChange={(v) => setMetric((v || "total") as ChartMetric)}
              placeholder="Select metric"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-64 w-full rounded-lg" />
      ) : chartSeries.length === 0 ? (
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
          No data for this period
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
            <defs>
              {chartSeries.map((s, i) => (
                <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} className="text-muted-foreground" />
            <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              formatter={(val, name) => [`${val} cr`, name]}
            />
            {chartSeries.length > 1 && <Legend wrapperStyle={{ fontSize: "12px" }} />}
            {chartSeries.map((s, i) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={CHART_COLORS[i % CHART_COLORS.length]}
                fill={`url(#grad-${s.key})`}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
