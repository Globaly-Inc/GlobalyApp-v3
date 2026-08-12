/**
 * One-time (and re-runnable) rollout: recompute completion_percentage for every existing profile.
 *
 * Why a script and not a migration: migrations stay schema-only. Importing runtime service code into a
 * migration couples the schema history to code that keeps changing and breaks replay. This uses the SAME
 * computeCompletion() the API uses, so the rollout and the runtime definition cannot diverge.
 *
 *   npm run backfill:completion
 *   npm run backfill:completion -- --dry-run
 *   npm run backfill:completion -- --user-id=42
 *
 * Idempotent: a second run reports 0 changed.
 */

import { masterKnex } from "../src/core/db/master-pool.js";
import { computeCompletion } from "../src/modules/platform-users/services/profile-completion.service.js";

const BATCH = 500;

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const userArg = args.find((a) => a.startsWith("--user-id="));
  const onlyUserId = userArg ? Number(userArg.split("=")[1]) : null;

  let lastId = 0;
  let scanned = 0;
  let changed = 0;

  for (;;) {
    const query = masterKnex("platform_user_profiles")
      .whereNull("deleted_at")
      .where("id", ">", lastId)
      .orderBy("id", "asc")
      .limit(BATCH)
      .select("id", "user_id", "completion_percentage");
    if (onlyUserId) query.where({ user_id: onlyUserId });

    const rows = await query;
    if (!rows.length) break;

    for (const row of rows) {
      lastId = Number(row.id);
      scanned++;
      const { percentage } = await computeCompletion(Number(row.user_id));
      if (Number(row.completion_percentage) === percentage) continue;
      changed++;
      console.log(`user ${row.user_id}: ${row.completion_percentage} -> ${percentage}${dryRun ? " (dry run)" : ""}`);
      if (!dryRun) {
        await masterKnex("platform_user_profiles")
          .where({ id: row.id })
          .update({ completion_percentage: percentage, updated_at: masterKnex.fn.now() });
      }
    }

    if (onlyUserId) break;
  }

  console.log(`\nbackfill-completion: scanned ${scanned}, changed ${changed}${dryRun ? " (dry run — nothing written)" : ""}`);
  await masterKnex.destroy();
}

main().catch(async (err) => {
  console.error("backfill-completion failed:", err);
  await masterKnex.destroy();
  process.exit(1);
});
