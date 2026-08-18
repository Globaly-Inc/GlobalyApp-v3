// G7 — FX rates cache (§3.6, V2 contract: apps/core-api/src/routes/fx-rates.ts).
//
// STORAGE DIVERGES FROM V2 ON PURPOSE, and this is the money-adjacent reason:
// V2 stores the whole quote set as `jsonb` (`rates: {"USD": 0.65, ...}`), which
// means every rate round-trips through an IEEE-754 double. A course fee converted
// with a drifted rate is a wrong price on a public page. So V3 stores one row per
// quote currency with `numeric(20,10)` — pg returns numerics as strings, so the
// value that comes back out is bit-for-bit the value that went in.
//
// billing/ was checked for precedent and is consistent with this: credit amounts
// are integers (minor units — 20260816_005_credit_transactions), and prices that
// cannot be integers are `decimal(12,2)` (20260817_001_billing_catalogue). Nothing
// money-shaped in V3 is stored as a float, and an FX rate is not going to be the
// first one.
//
// `fetched_at` is the snapshot key: all rows written by one provider fetch share
// it, so "the latest snapshot" is one `max(fetched_at)` per base currency and
// staleness is a property of the snapshot rather than of individual rows.

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("fx_rate_cache", (t) => {
    t.increments("id").primary();
    t.text("base_currency").notNullable();
    t.text("quote_currency").notNullable();
    // 20 digits total / 10 fractional: enough for the weakest currency pair on the
    // books (a base→quote rate in the tens of thousands) without losing cents.
    t.decimal("rate", 20, 10).notNullable();
    t.timestamp("fetched_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    // One rate per (snapshot, pair). A double-fetch past the TTL writes two
    // snapshots, not two conflicting rows inside one.
    t.unique(["base_currency", "quote_currency", "fetched_at"], {
      indexName: "fx_rate_cache_snapshot_pair_uniq",
    });
  });

  // The only read: newest snapshot for a base currency.
  await knex.raw(`
    CREATE INDEX fx_rate_cache_base_fetched_idx
      ON fx_rate_cache (base_currency, fetched_at DESC)
  `);

  await knex.raw(`
    ALTER TABLE fx_rate_cache
      ADD CONSTRAINT fx_rate_cache_rate_positive CHECK (rate > 0)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("fx_rate_cache");
}
