"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { businessApi } from "../../apis";
import { MonthlyChart } from "./monthly-chart";
import type { WidgetAnalytics } from "../../apis/types";


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
    { key: "rate", label: "Chat to contact", value: `${stats.conversionRate.value}%`, delta: `${signed(stats.conversionRate.deltaPts)} pts`, note: "vs last month" },
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
  const [data, setData] = useState<WidgetAnalytics | null>(null);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    businessApi.getWidgetAnalytics().then(setData).catch(() => setData(EMPTY));
  }, []);

  // Nothing has ever been recorded: a row of zeroes and a flat chart look like a broken dashboard,
  // when the truth is simply that the widget hasn't met anyone yet.
  const untouched = data !== null
    && data.stats.visitors.value === 0
    && data.stats.conversationsClosed.value === 0
    && data.stats.conversions.value === 0;

  return (
    // Nothing recorded yet is a placeholder, not a report: the board draws it dashed so it
    // doesn't sit on the page with the same weight as a card full of numbers.
    <Card className={untouched ? "border-dashed bg-muted/20 shadow-none" : undefined}>
      <CardHeader className="gap-1">
        <div>
          <CardTitle className="text-sm">{untouched ? "Visitor numbers appear here" : "Chat widget activity"}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {untouched
              ? "Once the widget is live we'll chart visitors, conversations and captured contacts."
              : "How students are engaging with your AI assistant"}
          </p>
        </div>
        {!untouched && (
          <CardAction>
            <Badge variant="outline" className="font-normal">Last 6 months</Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {untouched ? (
          <p className="text-sm text-muted-foreground">Nothing to show yet — that is expected on day one.</p>
        ) : data === null ? (
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

            {/* Board 11: two named series stacked, each readable as a table — not one chart
                behind a toggle, where the series nobody picked is invisible. */}
            <MonthlyChart id="closed" title="Conversations closed, by month" rows={data.monthly} series="conversationsClosed" kind="bar" />
            <MonthlyChart id="visitors" title="Website visitors, by month" rows={data.monthly} series="visitors" kind="area" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
