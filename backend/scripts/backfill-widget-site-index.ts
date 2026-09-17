/**
 * Register + queue a website crawl for institution widgets that already exist.
 *
 * Site indexing fires on embed-config create and activate. Widgets created before the
 * feature shipped are reached by neither — nothing backfills them, and the rack's recrawl
 * dispatcher only revisits sources that already exist — so without this they stay without
 * website knowledge indefinitely.
 *
 * Idempotent: ensureOwnerSiteIndex reuses an existing source and re-queues it.
 * Skips anything whose website fails the SSRF check, and says which.
 *
 *   npm run backfill:widget-site-index -- --dry-run
 *   npm run backfill:widget-site-index
 */
import "dotenv/config";
import { masterKnex } from "../src/core/db/master-pool.js";
import { ensureOwnerSiteIndex } from "../src/modules/ai-counsellor/services/site-index.service.js";

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const configs = await masterKnex("ai_embed_configs as c")
    .join("institutions as i", "i.id", "c.institution_id")
    .whereNotNull("c.institution_id")
    .where("c.is_active", true)
    .distinctOn("c.institution_id")
    .select("c.institution_id", "i.institution_name", "i.website")
    .orderBy("c.institution_id");

  console.log(`${configs.length} active institution widget(s)`);

  let queued = 0;
  let skipped = 0;
  for (const c of configs) {
    const label = `${c.institution_name ?? `institution ${c.institution_id}`} → ${c.website ?? "(no website)"}`;
    if (dryRun) {
      console.log(`  would index: ${label}`);
      continue;
    }
    const result = await ensureOwnerSiteIndex({ kind: "institution", id: c.institution_id }, c.website);
    if (result) {
      queued++;
      console.log(`  queued: ${label} (source ${result.sourceId}${result.queued ? "" : ", queue unavailable"})`);
    } else {
      skipped++;
      console.log(`  skipped: ${label} — no usable public website`);
    }
  }

  if (!dryRun) console.log(`\ndone — ${queued} queued, ${skipped} skipped`);
  await masterKnex.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
