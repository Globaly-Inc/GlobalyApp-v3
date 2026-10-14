import { Minus, TrendingDown, TrendingUp, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { RankingRow } from "../apis/types";
import { formatCtr } from "../utils";

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
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", improved ? "text-success" : "text-destructive")}>
      <Icon className="h-3.5 w-3.5" />
      {Math.abs(trend28d).toFixed(1)}
    </span>
  );
}

export function RankingsTable({ rows, stale }: Readonly<{ rows: RankingRow[]; stale: boolean }>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Keyword rankings</CardTitle>
      </CardHeader>
      {stale && (
        <CardContent>
          <Alert variant="warning">
            <TriangleAlert />
            <AlertDescription>Snapshot data is more than 48 hours old — showing the last successful fetch.</AlertDescription>
          </Alert>
        </CardContent>
      )}
      {rows.length === 0 ? (
        <CardContent>
          <p className="py-6 text-center text-sm text-muted-foreground">
            No tracked keywords yet. Add blog keywords or set a focus keyword on a post.
          </p>
        </CardContent>
      ) : (
        <div className="border-t border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Keyword</TableHead>
                <TableHead numeric>Position</TableHead>
                <TableHead numeric>Δ28d</TableHead>
                <TableHead numeric>Impressions</TableHead>
                <TableHead numeric>Clicks</TableHead>
                <TableHead numeric>CTR</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.keyword}>
                  <TableCell primary className="truncate font-medium text-foreground">{row.keyword}</TableCell>
                  <TableCell numeric className="text-muted-foreground">{row.position?.toFixed(1) ?? "—"}</TableCell>
                  <TableCell numeric><TrendBadge trend28d={row.trend28d} /></TableCell>
                  <TableCell numeric className="text-muted-foreground">{row.impressions.toLocaleString()}</TableCell>
                  <TableCell numeric className="text-muted-foreground">{row.clicks.toLocaleString()}</TableCell>
                  <TableCell numeric className="text-muted-foreground">{formatCtr(row.ctr)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}
