/**
 * Give every platform user a personal account (is_personal_account = true).
 *
 * Self-registration always set it, but users created any other way — invited team members, org
 * owners minted by an admin, promoted listings' placeholder owners — got the column's default
 * (false), so /personal/profile bounced them to /business/profile. New rows are covered in code
 * (platform-users.repository insert() always sets it); this fixes the rows created before that.
 *
 * REQUIRED after deploying this change to each environment (docs/setup/post-deploy-steps.md).
 *
 * DRY RUN BY DEFAULT — prints the plan and writes nothing. Pass --apply to commit.
 * Rerunnable: only touches rows where is_personal_account is false.
 *
 *   npm run users:backfill-personal-account                # plan only
 *   npm run users:backfill-personal-account -- --apply     # write
 */

import "dotenv/config";
import { masterKnex } from "../src/core/db/master-pool.js";

const APPLY = process.argv.includes("--apply");

const rows: { id: number; email: string | null }[] = await masterKnex("platform_users")
  .where({ is_personal_account: false })
  .whereNull("deleted_at")
  .select("id", "email")
  .orderBy("id");

console.log(`${rows.length} user(s) without a personal account` + (APPLY ? "" : " — DRY RUN, nothing will be written"));
for (const row of rows) console.log(`  ${APPLY ? "set" : "would set"}  ${row.id}  ${row.email ?? ""}`);

if (APPLY && rows.length) {
  await masterKnex("platform_users")
    .whereIn("id", rows.map((r) => r.id))
    .update({ is_personal_account: true, updated_at: masterKnex.fn.now() });
}

console.log(`\n${APPLY ? "applied" : "planned"}: ${rows.length} user(s)`);
if (!APPLY) console.log("Re-run with --apply to write.");

await masterKnex.destroy();
