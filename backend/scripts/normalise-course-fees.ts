/**
 * Rewrite existing superadmin.extraction_course_fees rows the way upsertFee() now writes them.
 *
 *   npm run fees:normalise                          # apply the column rewrites
 *   npm run fees:normalise -- --dry-run             # report only, rolls back
 *   npm run fees:normalise -- --merge-duplicates    # also merge rows that now share a dedupe key
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
  feeBreakdown,
  feeLabel,
  normaliseCurrency,
  normalisePeriodType,
} from "../src/modules/superadmin/data-extraction/lib/staging-writer.js";
import type { Installment } from "../src/modules/superadmin/data-extraction/lib/installment-parser.js";

const TABLE = "superadmin.extraction_course_fees";

const dryRun = process.argv.includes("--dry-run");
// Merging deletes rows, so it is opt-in — a plain run only reports how many would go.
const mergeDuplicates = process.argv.includes("--merge-duplicates");

type FeeRow = {
  id: string;
  job_id: string;
  name: string | null;
  description: string | null;
  period_type: string | null;
  currency: string | null;
  total_amount: string | number | null;
  installments: Installment[] | null;
};

async function normalise(db: Knex | Knex.Transaction) {
  const rows: FeeRow[] = await masterKnex(TABLE)
    .select("id", "job_id", "name", "description", "period_type", "currency", "total_amount",
      "installments");
  console.log(`${rows.length} fee row(s) to check\n`);

  const changed = { period_type: 0, currency: 0, name: 0, description: 0, installments: 0 };
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

    // Fees stored as a bare total open in the fee form as an empty installment worth 0, and
    // saving that overwrites the real amount — give every one the form's {fee_type, amount} lines.
    const totalAmount = row.total_amount == null ? null : Number(row.total_amount);
    const installments = feeBreakdown({
      name, period_type: periodType, total_amount: totalAmount, installments: row.installments,
    });

    const patch: Record<string, unknown> = {};
    if (periodType !== row.period_type) patch.period_type = periodType;
    if (currency !== row.currency) patch.currency = currency;
    if (name !== row.name) patch.name = name;
    if (description !== row.description) patch.description = description;
    if (JSON.stringify(installments) !== JSON.stringify(row.installments ?? [])) {
      patch.installments = JSON.stringify(installments);
    }
    if (Object.keys(patch).length === 0) continue;

    for (const key of Object.keys(patch)) changed[key as keyof typeof changed]++;
    await db(TABLE).where({ id: row.id }).update({ ...patch, updated_at: masterKnex.fn.now() });
    updated++;
  }

  console.log(`${updated} row(s) rewritten — ${Object.entries(changed).map(([k, v]) => `${k}: ${v}`).join(", ")}`);

  await consolidate(db, mergeDuplicates);

  const summary = async (column: string) =>
    db(TABLE).select(column).count("id as count").groupBy(column).orderBy("count", "desc");
  console.table(await summary("period_type"));
  console.table(await summary("currency"));
  console.table((await summary("name")).slice(0, 10));
}

const ASSIGNMENTS = "superadmin.extraction_course_fee_assignments";

/**
 * Merge rows that only ever differed by spelling.
 *
 * "total"/"Total" and "$"/"USD" were distinct dedupe keys, so upsertFee inserted a second row for
 * a fee it should have found. Normalising the columns above collapses the keys but leaves the
 * duplicate rows — two identical cards in the fees tab, and a later upsertFee's .first() picking
 * whichever one Postgres returns. The oldest row of each key wins, inherits any name/description
 * its twins had, and takes over their course assignments before they are deleted.
 *
 * Reads through `db` so it sees the values normalise() just wrote in this same transaction.
 */
async function consolidate(db: Knex | Knex.Transaction, apply: boolean) {
  const rows: Array<Pick<FeeRow, "id" | "job_id" | "name" | "description" | "period_type" | "currency">
    & { student_type: string; total_amount: string | number | null }> = await db(TABLE)
    .select("id", "job_id", "name", "description", "student_type", "period_type", "currency", "total_amount")
    .orderBy("created_at", "asc");

  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = [row.job_id, row.student_type, row.period_type ?? "", row.currency ?? "",
      row.total_amount ?? ""].join("|");
    const bucket = groups.get(key);
    if (bucket) bucket.push(row);
    else groups.set(key, [row]);
  }

  let merged = 0;
  let reassigned = 0;
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    if (!apply) { merged += group.length - 1; continue; }
    const [keeper, ...dupes] = group as [typeof rows[number], ...typeof rows];
    const dupeIds = dupes.map((d) => d.id);

    const fill: Record<string, unknown> = {};
    if (!keeper.name) fill.name = dupes.find((d) => d.name)?.name ?? null;
    if (!keeper.description) fill.description = dupes.find((d) => d.description)?.description ?? null;
    if (fill.name || fill.description) {
      await db(TABLE).where({ id: keeper.id }).update({ ...fill, updated_at: masterKnex.fn.now() });
    }

    // Repoint only where the course isn't already linked to the keeper — the (course_id,
    // course_fee_id) unique constraint would reject the rest, and they are redundant anyway.
    const moved = await db(ASSIGNMENTS)
      .whereIn("course_fee_id", dupeIds)
      .whereNotExists(function () {
        this.select(1).from(`${ASSIGNMENTS} as a2`)
          .whereRaw(`a2.course_id = ${ASSIGNMENTS}.course_id`)
          .andWhere("a2.course_fee_id", keeper.id);
      })
      .update({ course_fee_id: keeper.id });
    reassigned += Number(moved);

    // The leftovers cascade away with their fee row.
    await db(TABLE).whereIn("id", dupeIds).delete();
    merged += dupeIds.length;
  }

  console.log(apply
    ? `${merged} duplicate fee row(s) merged, ${reassigned} course assignment(s) repointed`
    : `${merged} duplicate fee row(s) share a key with an older row — pass --merge-duplicates to merge them`);
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
