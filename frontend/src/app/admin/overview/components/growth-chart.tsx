"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { GrowthPoint } from "../apis/types";
import type { ViewMode } from "../types";
import { applyCumulative, buildSeries } from "../utils";
import { LineChart } from "./line-chart";

const MODES: ViewMode[] = ["days", "week", "month"];

export function GrowthChart({
  title,
  points,
  days,
  color,
  loading,
  wide = false,
}: Readonly<{
  title: string;
  points: GrowthPoint[];
  days: number;
  color: string;
  loading: boolean;
  wide?: boolean;
}>) {
  const [mode, setMode] = useState<ViewMode>("days");
  const [cumulative, setCumulative] = useState(false);

  const series = buildSeries(points, days, mode);
  const data = cumulative ? applyCumulative(series) : series;

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <CardTitle>{title}</CardTitle>
        <div className="flex flex-wrap items-center gap-3">
          <ToggleGroup aria-label="Group by" value={[mode]} onValueChange={(next) => next[0] && setMode(next[0] as ViewMode)}>
            {MODES.map((m) => (
              <ToggleGroupItem key={m} value={m} size="sm">
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Cumulative
            <Switch checked={cumulative} onCheckedChange={setCumulative} />
          </label>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-[280px] w-full" /> : <LineChart data={data} color={color} wide={wide} />}
      </CardContent>
    </Card>
  );
}
