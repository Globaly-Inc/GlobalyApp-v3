import type { RankingRow, ReadinessRow } from "../apis/types";

export function sumBy(rows: RankingRow[], key: "impressions" | "clicks"): number {
  return rows.reduce((sum, row) => sum + row[key], 0);
}

/** Mean AEO readiness score, or null when there are no published posts to score. */
export function averageReadiness(readiness: ReadinessRow[]): number | null {
  if (readiness.length === 0) return null;
  return Math.round(readiness.reduce((sum, post) => sum + post.score, 0) / readiness.length);
}

export function formatCtr(ctr: number | null): string {
  return ctr === null ? "—" : `${(ctr * 100).toFixed(1)}%`;
}
