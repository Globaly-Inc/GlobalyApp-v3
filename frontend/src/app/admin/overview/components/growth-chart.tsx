"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
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
      <CardHeader className="flex-row items-center justify-between flex-wrap gap-2 space-y-0">
        <CardTitle className="text-base">{title}</CardTitle>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-border overflow-hidden">
            {MODES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  "px-2 py-1 text-xs font-medium transition-colors",
                  mode === m
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-muted",
                )}
              >
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Cumulative</span>
            <Button
              variant={cumulative ? "default" : "outline"}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setCumulative(!cumulative)}
            >
              {cumulative ? "On" : "Off"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-[280px] w-full" /> : <LineChart data={data} color={color} wide={wide} />}
      </CardContent>
    </Card>
  );
}
