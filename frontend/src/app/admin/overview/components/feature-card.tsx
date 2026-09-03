import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Minus, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { FALLBACK_FEATURE_META, FEATURE_META } from "../const";
import type { FeatureUsage } from "../apis/types";

export function FeatureCard({ feature }: Readonly<{ feature: FeatureUsage }>) {
  const { icon: Icon } = FEATURE_META[feature.key] ?? FALLBACK_FEATURE_META;
  // last_week = rows created in the last 7 days, so it IS the weekly delta
  const delta = feature.last_week;
  const base = feature.count - delta;
  const pct = base > 0 ? ((delta / base) * 100).toFixed(1) : delta > 0 ? "100" : "0";
  const changed = delta > 0;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-1">
        <CardTitle className="text-sm font-medium">{feature.label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{feature.count.toLocaleString()}</p>
        <div className="flex items-center gap-1 mt-1">
          {changed ? (
            <TrendingUp className="h-3 w-3 text-emerald-600" />
          ) : (
            <Minus className="h-3 w-3 text-muted-foreground" />
          )}
          <span className={cn("text-xs", changed ? "text-emerald-600" : "text-muted-foreground")}>
            {changed ? `+${delta} (${pct}%)` : "No change"}
          </span>
          <span className="text-xs text-muted-foreground">this week</span>
        </div>
      </CardContent>
    </Card>
  );
}
