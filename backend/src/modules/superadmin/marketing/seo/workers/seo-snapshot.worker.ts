// Daily one-shot: fetch the last 28 days of GSC Search Analytics for the tracked keyword set
// and upsert into superadmin.seo_keyword_snapshots. Cron-triggered, not a long-lived process —
// run on a schedule via cron/systemd-timer: `npm run job:seo-snapshot`.
//
// GSC unset or unreachable -> log and exit 0 (last snapshot stays in place; the rankings API
// surfaces a stale banner instead of failing — same stale-over-fail philosophy as the FX cache).

import "dotenv/config";
import { createChildLogger } from "../../../../../shared/logger.js";
import * as gscClient from "../lib/gsc-client.js";
import * as repo from "../repositories/snapshots.repository.js";

const logger = createChildLogger("seo-snapshot-worker");

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function main() {
  if (!gscClient.isConfigured()) {
    logger.info("GSC not configured — skipping snapshot sweep");
    return;
  }

  const keywords = await repo.trackedKeywords();
  if (keywords.length === 0) {
    logger.info("No tracked keywords — nothing to snapshot");
    return;
  }

  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - 28);

  let rows: Awaited<ReturnType<typeof gscClient.querySearchAnalytics>>;
  try {
    rows = await gscClient.querySearchAnalytics({
      startDate: formatDate(start),
      endDate: formatDate(end),
      dimensions: ["query", "date"],
      rowLimit: 25000,
    });
  } catch (err) {
    logger.error("GSC snapshot fetch failed", { err: err instanceof Error ? err.message : String(err) });
    return;
  }

  const trackedLower = new Set(keywords.map((k) => k.toLowerCase()));
  const snapshotRows = rows
    .filter((r) => trackedLower.has((r.keys[0] ?? "").toLowerCase()) && r.keys[1])
    .map((r) => ({
      keyword: r.keys[0]!,
      date: r.keys[1]!,
      position: r.position,
      impressions: r.impressions,
      clicks: r.clicks,
      ctr: r.ctr,
    }));

  await repo.upsertSnapshots(snapshotRows);
  logger.info(`SEO snapshot: upserted ${snapshotRows.length} row(s) for ${keywords.length} tracked keyword(s)`);
}

await main();
process.exit(0);
