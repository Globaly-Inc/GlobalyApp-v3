// fx_rate_cache access. Explicit columns, no `select *`.
//
// A "snapshot" is every row sharing one `fetched_at` for one base currency. That is
// what makes staleness a property of the set rather than of individual pairs: a
// half-refreshed cache would otherwise mix a fresh USD rate with a two-day-old INR
// one and report itself fresh.

import { masterKnex } from "../../../core/db/master-pool.js";

const TABLE = "fx_rate_cache";

export interface FxSnapshot {
  fetchedAt: Date;
  /** Quote currency → exact decimal string, straight out of `numeric(20,10)`. */
  rates: Record<string, string>;
}

/** The newest snapshot for a base currency, or undefined when the cache is empty. */
export async function latestSnapshot(baseCurrency: string): Promise<FxSnapshot | undefined> {
  const newest = await masterKnex(TABLE)
    .select("fetched_at")
    .where({ base_currency: baseCurrency })
    .orderBy("fetched_at", "desc")
    .first<{ fetched_at: Date } | undefined>();
  if (!newest) return undefined;

  const rows = await masterKnex(TABLE)
    .select("quote_currency", "rate")
    .where({ base_currency: baseCurrency, fetched_at: newest.fetched_at });

  const rates: Record<string, string> = {};
  for (const row of rows as Array<{ quote_currency: string; rate: string }>) {
    // pg returns numeric as a string. Keeping it one preserves every digit that
    // was stored; Number() happens once, at the HTTP boundary.
    rates[row.quote_currency] = String(row.rate);
  }
  return { fetchedAt: new Date(newest.fetched_at), rates };
}

/**
 * Write one snapshot. All pairs share a single `fetched_at`, generated here rather
 * than defaulted per row, so `now()` cannot drift across the insert and split one
 * fetch into two snapshots.
 */
export async function saveSnapshot(
  baseCurrency: string,
  rates: Record<string, string>,
  fetchedAt: Date = new Date(),
): Promise<void> {
  const rows = Object.entries(rates).map(([quote, rate]) => ({
    base_currency: baseCurrency,
    quote_currency: quote,
    rate,
    fetched_at: fetchedAt,
  }));
  if (rows.length === 0) return;

  // ponytail: lazy refresh-on-read (V1 and V2 both do this) means a concurrent burst
  // past the TTL can fetch twice. onConflict makes the second write a no-op instead
  // of a crash; the extra snapshot is harmless because reads take the newest.
  // Move to a scheduled worker if the provider's free-tier call budget ever bites.
  await masterKnex(TABLE)
    .insert(rows)
    .onConflict(["base_currency", "quote_currency", "fetched_at"])
    .merge(["rate"]);
}
