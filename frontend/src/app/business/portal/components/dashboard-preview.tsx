"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { businessApi } from "../../apis";
import { MonthlyChart } from "./monthly-chart";
import type { WidgetAnalytics } from "../../apis/types";


/** One column on a phone so no label truncates; four across once the main column is wide enough. */
const STAT_GRID = "grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4";

const fmt = (n: number) => n.toLocaleString();
const signed = (n: number) => `${n > 0 ? "+" : ""}${n}`;

function statCards(data: WidgetAnalytics) {
  const { stats } = data;
  return [
    { key: "visitors", label: "Website visitors", value: fmt(stats.visitors.value), delta: `${signed(stats.visitors.deltaPct)}%`, down: stats.visitors.deltaPct < 0, note: "vs last month" },
    {
      key: "conversationsClosed", label: "Conversations closed", value: fmt(stats.conversationsClosed.value),
      delta: `${signed(stats.conversationsClosed.deltaPct)}%`, down: stats.conversationsClosed.deltaPct < 0, note: "vs last month",
    },
    { key: "conversions", label: "Contacts captured", value: fmt(stats.conversions.value), delta: signed(stats.conversions.delta), down: stats.conversions.delta < 0, note: "vs last month" },
    { key: "rate", label: "Chat to contact", value: `${stats.conversionRate.value}%`, delta: `${signed(stats.conversionRate.deltaPts)} pts`, down: stats.conversionRate.deltaPts < 0, note: "vs last month" },
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
      <CardHeader>
        <CardTitle>{untouched ? "Visitor numbers appear here" : "Chat widget activity"}</CardTitle>
        <CardDescription>
          {untouched
            ? "Once the widget is live we'll chart visitors, conversations and captured contacts."
            : "How students are engaging with your AI assistant"}
        </CardDescription>
        {!untouched && (
          <CardAction>
            <Badge variant="outline"><CalendarDays aria-hidden />Last 6 months</Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {untouched ? (
          <p className="text-sm text-muted-foreground">Nothing to show yet — that is expected on day one.</p>
        ) : data === null ? (
          <div className="flex flex-col gap-5">
            <div className={STAT_GRID}>
              {statCards(EMPTY).map((s) => <StatCard key={s.key} label={s.label} value="" loading />)}
            </div>
            <Skeleton className="h-[220px] rounded-lg" />
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <div className={STAT_GRID}>
              {statCards(data).map((s) => (
                <StatCard
                  key={s.key}
                  label={s.label}
                  value={s.value}
                  hint={<><span className={s.down ? "font-semibold text-destructive" : "font-semibold text-success"}>{s.delta}</span> {s.note}</>}
                />
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
