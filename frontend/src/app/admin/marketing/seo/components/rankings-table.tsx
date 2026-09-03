import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RankingRow } from "../apis/types";

function TrendBadge({ trend28d }: Readonly<{ trend28d: number | null }>) {
  if (trend28d === null || trend28d === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Minus className="h-3.5 w-3.5" />
        —
      </span>
    );
  }
  const improved = trend28d > 0; // position number went down = improved
  const Icon = improved ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${improved ? "text-emerald-600" : "text-destructive"}`}>
      <Icon className="h-3.5 w-3.5" />
      {Math.abs(trend28d).toFixed(1)}
    </span>
  );
}

function formatCtr(ctr: number | null): string {
  return ctr === null ? "—" : `${(ctr * 100).toFixed(1)}%`;
}

export function RankingsTable({ rows, stale }: Readonly<{ rows: RankingRow[]; stale: boolean }>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Keyword rankings</CardTitle>
      </CardHeader>
      <CardContent>
        {stale && (
          <p className="mb-3 rounded-md bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700 dark:text-amber-400">
            Snapshot data is more than 48 hours old — showing the last successful fetch.
          </p>
        )}
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No tracked keywords yet. Add blog keywords or set a focus keyword on a post.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Keyword</th>
                  <th className="py-2 pr-4 font-medium">Position</th>
                  <th className="py-2 pr-4 font-medium">Δ28d</th>
                  <th className="py-2 pr-4 font-medium">Impressions</th>
                  <th className="py-2 pr-4 font-medium">Clicks</th>
                  <th className="py-2 pr-4 font-medium">CTR</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.keyword} className="border-b border-border last:border-b-0">
                    <td className="py-2.5 pr-4 font-medium text-foreground">{row.keyword}</td>
                    <td className="py-2.5 pr-4 text-muted-foreground">{row.position?.toFixed(1) ?? "—"}</td>
                    <td className="py-2.5 pr-4"><TrendBadge trend28d={row.trend28d} /></td>
                    <td className="py-2.5 pr-4 text-muted-foreground">{row.impressions.toLocaleString()}</td>
                    <td className="py-2.5 pr-4 text-muted-foreground">{row.clicks.toLocaleString()}</td>
                    <td className="py-2.5 pr-4 text-muted-foreground">{formatCtr(row.ctr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
