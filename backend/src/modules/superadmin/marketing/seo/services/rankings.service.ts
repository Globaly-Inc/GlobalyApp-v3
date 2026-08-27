import * as repo from "../repositories/snapshots.repository.js";

const STALE_AFTER_MS = 48 * 60 * 60 * 1000;

/** Pure — no I/O — so it's directly testable. `newestSnapshotDate: null` (no snapshots yet) is
 * treated as stale: there is nothing fresh to show. */
export function computeStale(newestSnapshotDate: Date | null, now: Date = new Date()): boolean {
  if (!newestSnapshotDate) return true;
  return now.getTime() - newestSnapshotDate.getTime() > STALE_AFTER_MS;
}

export type RankingRow = {
  keyword: string;
  position: number | null;
  impressions: number;
  clicks: number;
  ctr: number | null;
  trend28d: number | null; // positive = improved (position number went down)
  history: Array<{ date: string; position: number | null; impressions: number; clicks: number; ctr: number | null }>;
};

export type RankingsResult = { rows: RankingRow[]; stale: boolean; newestSnapshotAt: string | null };

function toDate(value: unknown): Date {
  return value instanceof Date ? value : new Date(String(value));
}

export async function getRankings(): Promise<RankingsResult> {
  const keywords = await repo.trackedKeywords();
  if (keywords.length === 0) return { rows: [], stale: true, newestSnapshotAt: null };

  const since = new Date();
  since.setDate(since.getDate() - 28);
  const sinceDate = since.toISOString().slice(0, 10);
  const snapshots = await repo.listRecentSnapshots(keywords, sinceDate);

  const byKeyword = new Map<string, typeof snapshots>();
  for (const s of snapshots) {
    const list = byKeyword.get(s.keyword) ?? [];
    list.push(s);
    byKeyword.set(s.keyword, list);
  }

  const rows: RankingRow[] = keywords.map((keyword) => {
    const history = (byKeyword.get(keyword) ?? []).map((s) => ({
      date: String(s.date),
      position: s.position === null ? null : Number(s.position),
      impressions: Number(s.impressions),
      clicks: Number(s.clicks),
      ctr: s.ctr === null ? null : Number(s.ctr),
    }));
    const oldest = history[0] ?? null;
    const latest = history[history.length - 1] ?? null;
    const trend28d =
      oldest && latest && oldest.position !== null && latest.position !== null
        ? oldest.position - latest.position
        : null;
    return {
      keyword,
      position: latest?.position ?? null,
      impressions: latest?.impressions ?? 0,
      clicks: latest?.clicks ?? 0,
      ctr: latest?.ctr ?? null,
      trend28d,
      history,
    };
  });

  const newestSnapshotDate = snapshots.length
    ? snapshots.reduce((max, s) => (toDate(s.date) > max ? toDate(s.date) : max), toDate(snapshots[0].date))
    : null;

  return {
    rows,
    stale: computeStale(newestSnapshotDate),
    newestSnapshotAt: newestSnapshotDate ? newestSnapshotDate.toISOString() : null,
  };
}
