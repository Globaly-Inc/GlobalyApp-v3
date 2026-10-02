// An org's default currency follows its country unless someone picked one: set on extraction,
// on a profile edit that sets the country, and backfilled by scripts/backfill-org-currency.ts.

import { masterKnex } from "../core/db/master-pool.js";

/** The currency code of a country (countries.currency, e.g. "NPR"), or null. */
export async function countryCurrency(countryId: number | null | undefined): Promise<string | null> {
  if (countryId == null) return null;
  const row = await masterKnex("countries").where({ id: countryId }).first("currency");
  return row?.currency ?? null;
}

/** For an org-profile update: a patch that sets country_id (and not currency) also fills a still
 * blank currency from that country — never overwrites one already chosen. */
export function withCountryCurrency(data: Record<string, unknown>): Record<string, unknown> {
  if (data.country_id == null || data.currency !== undefined) return data;
  return {
    ...data,
    currency: masterKnex.raw("coalesce(nullif(currency, ''), (select c.currency from countries c where c.id = ?))", [Number(data.country_id)]),
  };
}
