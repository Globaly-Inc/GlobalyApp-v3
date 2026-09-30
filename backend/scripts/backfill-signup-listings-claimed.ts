/**
 * Claim listings their owner signed up for but that still read "unclaimed".
 *
 * Sign-up has created its listing `claimed` only since 2026-08-31 (claim_status was added then);
 * listings signed up before that kept the column default, "unclaimed", although their owner created
 * them. Anything that asks "does this listing have a real owner" — the extraction-complete email
 * among them — skipped those owners.
 *
 * origin 'signup' alone isn't enough: 20260923_003 backfilled every job-less legacy row to 'signup',
 * and those have no owner or tenant. Claiming one would lock it, since every claim flow refuses a
 * claimed listing — so only rows with a live owner and a provisioned schema move.
 *
 * DRY RUN BY DEFAULT — prints the plan and writes nothing. Pass --apply to commit.
 * Rerunnable: only touches rows still "unclaimed". Not reversible — afterwards a backfilled row is
 * indistinguishable from one sign-up created claimed.
 *
 *   npm run listings:backfill-claimed                 # plan only
 *   npm run listings:backfill-claimed -- --apply      # write
 */

import "dotenv/config";
import { masterKnex } from "../src/core/db/master-pool.js";

const APPLY = process.argv.includes("--apply");

const LISTINGS = [
  { table: "institutions", owner: "platform_user_id", name: "institution_name" },
  { table: "businesses", owner: "owner_id", name: "business_name" },
] as const;

let total = 0;
for (const { table, owner, name } of LISTINGS) {
  const rows: { id: number; name: string | null }[] = await masterKnex(`${table} as t`)
    .where({ "t.origin": "signup", "t.claim_status": "unclaimed" })
    .whereNull("t.deleted_at")
    .whereNotNull("t.schema_provisioned_at")
    .whereExists((q) => q.from("platform_users as u").whereRaw(`u.id = t.${owner}`).whereNull("u.deleted_at"))
    .select("t.id", `t.${name} as name`)
    .orderBy("t.id");

  console.log(`\n${table}: ${rows.length} unclaimed sign-up listing(s) with a live owner` + (APPLY ? "" : " — DRY RUN"));
  for (const row of rows) console.log(`  ${APPLY ? "claim" : "would claim"}  ${row.id}  ${(row.name ?? "").slice(0, 60)}`);

  if (APPLY && rows.length) {
    await masterKnex(table)
      .whereIn("id", rows.map((r) => r.id))
      .where({ claim_status: "unclaimed" })
      .update({ claim_status: "claimed", updated_at: masterKnex.fn.now() });
  }
  total += rows.length;
}

console.log(`\n${APPLY ? "applied" : "planned"}: ${total} listing(s)`);
if (!APPLY) console.log("Re-run with --apply to write.");

await masterKnex.destroy();
