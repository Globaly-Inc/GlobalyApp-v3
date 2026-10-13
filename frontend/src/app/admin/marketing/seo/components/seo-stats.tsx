import { FileCheck2, KeyRound, MousePointerClick, Eye } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import type { RankingRow, ReadinessRow } from "../apis/types";
import { averageReadiness, sumBy } from "../utils";

type SeoStatsProps = { rankings: RankingRow[]; readiness: ReadinessRow[] };

/** Headline numbers derived from the loaded dashboard data — no extra fetch. */
export function SeoStats({ rankings, readiness }: Readonly<SeoStatsProps>) {
  const avgScore = averageReadiness(readiness);
  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      <StatCard label="Tracked keywords" icon={KeyRound} value={rankings.length.toLocaleString()} />
      <StatCard label="Impressions" icon={Eye} value={sumBy(rankings, "impressions").toLocaleString()} hint="Across tracked keywords" />
      <StatCard label="Clicks" icon={MousePointerClick} value={sumBy(rankings, "clicks").toLocaleString()} hint="Across tracked keywords" />
      <StatCard
        label="Avg. AEO readiness"
        icon={FileCheck2}
        value={avgScore === null ? "—" : `${avgScore}/100`}
        hint={`${readiness.length} published posts`}
      />
    </div>
  );
}
