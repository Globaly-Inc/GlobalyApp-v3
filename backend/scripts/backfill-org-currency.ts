/**
 * Fill each business's / institution's blank default currency from its country
 * (countries.currency) — the Default Currency card showed "No default currency set" for every
 * extracted or claimed org. New rows are covered in code (shared/country-currency.ts: extraction
 * and any profile edit that sets the country); this fixes the rows created before that.
 * Never overwrites a currency someone already picked.
 *
 * DRY RUN BY DEFAULT — prints the plan and writes nothing. Pass --apply to commit.
 * Rerunnable: only touches rows whose currency is blank and whose country has one.
 *
 *   npm run orgs:backfill-currency                # plan only
 *   npm run orgs:backfill-currency -- --apply     # write
 */

import "dotenv/config";
import { masterKnex } from "../src/core/db/master-pool.js";

const APPLY = process.argv.includes("--apply");
const TABLES = [
  { table: "businesses", nameCol: "business_name" },
  { table: "institutions", nameCol: "institution_name" },
] as const;

let total = 0;
for (const { table, nameCol } of TABLES) {
  const rows: { id: number; name: string | null; currency: string }[] = await masterKnex(`${table} as t`)
    .join("countries as c", "c.id", "t.country_id")
    .whereNotNull("c.currency")
    .whereRaw("coalesce(t.currency, '') = ''")
    .whereNull("t.deleted_at")
    .select("t.id", `t.${nameCol} as name`, "c.currency")
    .orderBy("t.id");

  console.log(`${table}: ${rows.length} with no currency` + (APPLY ? "" : " — DRY RUN, nothing will be written"));
  for (const row of rows) console.log(`  ${APPLY ? "set" : "would set"}  ${row.id}  ${(row.name ?? "").slice(0, 60)}  -> ${row.currency}`);

  if (APPLY) {
    // One row at a time is fine — a few hundred orgs at most.
    for (const row of rows) {
      await masterKnex(table).where({ id: row.id }).whereRaw("coalesce(currency, '') = ''")
        .update({ currency: row.currency, updated_at: masterKnex.fn.now() });
    }
  }
  total += rows.length;
}

console.log(`\n${APPLY ? "applied" : "planned"}: ${total} org(s)`);
if (!APPLY) console.log("Re-run with --apply to write.");

await masterKnex.destroy();
