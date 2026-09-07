/**
 * Rewrite existing superadmin.extraction_course_fees rows the way upsertFee() now writes them.
 *
 *   npm run fees:normalise                # apply
 *   npm run fees:normalise -- --dry-run   # report only, rolls back
 *
 * Run once after the 20260907_001 migration adds the description column. Rows written before it
 * carry the whole page line as their name ("$1,090 per credit 33 total credits $35,970 total
 * cost"), a currency that is sometimes a bare symbol / "" / the literal text "null", and a
 * period_type that drifted ("total" vs "Total", "per_term", "Per Credit") — which also split the
 * upsertFee dedupe key, so identical fees landed as separate rows.
 *
 * The rules live in staging-writer.ts, not here: this reuses feeLabel(), normalisePeriodType()
 * and normaliseCurrency() so the backfill can never disagree with the write path.
 *
 * Rerunnable — every value is derived from the row itself, so a second run is a no-op.
 */

import "dotenv/config";
import type { Knex } from "knex";
import { masterKnex } from "../src/core/db/master-pool.js";
import {
  feeLabel,
  normaliseCurrency,
  normalisePeriodType,
} from "../src/modules/superadmin/data-extraction/lib/staging-writer.js";

const TABLE = "superadmin.extraction_course_fees";

const dryRun = process.argv.includes("--dry-run");

type FeeRow = {
  id: string;
  job_id: string;
  name: string | null;
  description: string | null;
  period_type: string | null;
  currency: string | null;
  total_amount: string | number | null;
};

async function normalise(db: Knex | Knex.Transaction) {
  const rows: FeeRow[] = await masterKnex(TABLE)
    .select("id", "job_id", "name", "description", "period_type", "currency", "total_amount");
  console.log(`${rows.length} fee row(s) to check\n`);

  const changed = { period_type: 0, currency: 0, name: 0, description: 0 };
  let updated = 0;

  for (const row of rows) {
    const periodType = normalisePeriodType(row.period_type);
    const name = feeLabel(row.name, periodType);
    // An existing description wins; otherwise a name that was really page text becomes one.
    const description = row.description?.trim()
      || (row.name && row.name.trim() !== name ? row.name.trim() : null);
    // A row with no amount has nothing to label, so an unknown currency stays unknown rather
    // than inheriting the institution's — see the nullable-amount migration (20260826_002).
    const currency = !row.currency?.trim() && row.total_amount == null
      ? null
      : await normaliseCurrency(row.currency, row.job_id);

    const patch: Record<string, unknown> = {};
    if (periodType !== row.period_type) patch.period_type = periodType;
    if (currency !== row.currency) patch.currency = currency;
    if (name !== row.name) patch.name = name;
    if (description !== row.description) patch.description = description;
    if (Object.keys(patch).length === 0) continue;

    for (const key of Object.keys(patch)) changed[key as keyof typeof changed]++;
    await db(TABLE).where({ id: row.id }).update({ ...patch, updated_at: masterKnex.fn.now() });
    updated++;
  }

  console.log(`${updated} row(s) rewritten — ${Object.entries(changed).map(([k, v]) => `${k}: ${v}`).join(", ")}`);

  const summary = async (column: string) =>
    db(TABLE).select(column).count("id as count").groupBy(column).orderBy("count", "desc");
  console.table(await summary("period_type"));
  console.table(await summary("currency"));
  console.table((await summary("name")).slice(0, 10));
}

if (dryRun) {
  console.log("DRY RUN — every change is rolled back\n");
  await masterKnex
    .transaction(async (trx) => {
      await normalise(trx);
      throw new Error("__rollback__");
    })
    .catch((e: Error) => {
      if (e.message !== "__rollback__") throw e;
      console.log("\nRolled back — nothing was written.");
    });
} else {
  await normalise(masterKnex);
}

await masterKnex.destroy();
