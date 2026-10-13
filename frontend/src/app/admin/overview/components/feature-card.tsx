import { Minus, TrendingUp } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { cn } from "@/lib/utils";
import { FALLBACK_FEATURE_META, FEATURE_META } from "../const";
import type { FeatureUsage } from "../apis/types";

export function FeatureCard({ feature }: Readonly<{ feature: FeatureUsage }>) {
  const { icon } = FEATURE_META[feature.key] ?? FALLBACK_FEATURE_META;
  // last_week = rows created in the last 7 days, so it IS the weekly delta
  const delta = feature.last_week;
  const base = feature.count - delta;
  const pct = base > 0 ? ((delta / base) * 100).toFixed(1) : delta > 0 ? "100" : "0";
  const changed = delta > 0;

  return (
    <StatCard
      label={feature.label}
      icon={icon}
      value={feature.count.toLocaleString()}
      hint={
        <span className="flex items-center gap-1">
          {changed ? <TrendingUp className="size-3 text-success" /> : <Minus className="size-3" />}
          <span className={cn(changed && "text-success")}>{changed ? `+${delta} (${pct}%)` : "No change"}</span>
          this week
        </span>
      }
    />
  );
}
