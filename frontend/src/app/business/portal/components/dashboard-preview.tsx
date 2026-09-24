"use client";

import { useEffect, useRef, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { businessApi } from "../../apis";
import type { WidgetAnalytics } from "../../apis/types";

type SeriesKey = "conversationsClosed" | "conversions" | "visitors";

const SERIES_LABELS: Record<SeriesKey, string> = {
  conversationsClosed: "Conversations closed",
  conversions: "Conversions",
  visitors: "Visitors",
};

const fmt = (n: number) => n.toLocaleString();
const signed = (n: number) => `${n > 0 ? "+" : ""}${n}`;

function statCards(data: WidgetAnalytics) {
  const { stats } = data;
  return [
    { key: "visitors", label: "Website visitors", value: fmt(stats.visitors.value), delta: `${signed(stats.visitors.deltaPct)}%`, note: "vs last month" },
    {
      key: "conversationsClosed", label: "Conversations closed", value: fmt(stats.conversationsClosed.value),
      delta: `${signed(stats.conversationsClosed.deltaPct)}%`, note: "vs last month",
    },
    { key: "conversions", label: "Contacts captured", value: fmt(stats.conversions.value), delta: signed(stats.conversions.delta), note: "vs last month" },
    { key: "rate", label: "Conversion rate", value: `${stats.conversionRate.value}%`, delta: `${signed(stats.conversionRate.deltaPts)}pts`, note: "chat → contact" },
  ];
}

const EMPTY: WidgetAnalytics = {
  stats: {
    visitors: { value: 0, deltaPct: 0 },
    conversationsClosed: { value: 0, deltaPct: 0 },
    conversions: { value: 0, delta: 0 },
    conversionRate: { value: 0, deltaPts: 0 },
  },
  monthly: ["Apr", "May", "Jun", "Jul", "Aug", "Sep"].map((month) => ({ month, visitors: 0, conversationsClosed: 0, conversions: 0 })),
};

export function DashboardPreview() {
  const [series, setSeries] = useState<SeriesKey>("conversationsClosed");
  const [data, setData] = useState<WidgetAnalytics | null>(null);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    businessApi.getWidgetAnalytics().then(setData).catch(() => setData(EMPTY));
  }, []);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-sm">Chat widget activity</CardTitle>
          <p className="text-xs text-muted-foreground">How students are engaging with your AI assistant</p>
        </div>
        <Badge variant="outline" className="shrink-0 font-normal">Last 6 months</Badge>
      </CardHeader>
      <CardContent>
        {data === null ? (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[74px] rounded-lg" />)}
            </div>
            <Skeleton className="h-[220px] rounded-lg" />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {statCards(data).map((s) => (
                <div key={s.key} className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="mt-1 text-xl font-bold tabular-nums">{s.value}</p>
                  <p className="mt-0.5 text-xs">
                    <span className="font-medium text-emerald-600">{s.delta}</span>{" "}
                    <span className="text-muted-foreground">{s.note}</span>
                  </p>
                </div>
              ))}
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-xs font-medium text-muted-foreground">Growth over 6 months</p>
                <div className="flex rounded-lg border border-border p-0.5 text-xs">
                  {(Object.keys(SERIES_LABELS) as SeriesKey[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSeries(key)}
                      className={cn(
                        "rounded-md px-2.5 py-1 font-medium transition-colors",
                        series === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {SERIES_LABELS[key]}
                    </button>
                  ))}
                </div>
              </div>

              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={data.monthly} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dashboard-preview-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                  <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" width={48} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px" }}
                  />
                  <Area
                    type="monotone"
                    dataKey={series}
                    name={SERIES_LABELS[series]}
                    stroke="var(--primary)"
                    fill="url(#dashboard-preview-fill)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
