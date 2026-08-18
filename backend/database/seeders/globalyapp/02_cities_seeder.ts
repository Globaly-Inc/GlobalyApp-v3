import { createRequire } from "node:module";
import type { Knex } from "knex";

// City catalogue keyed by country ISO-2, extracted from the V1 cities table and
// filtered to the countries this app seeds. Data lives in JSON so the seeder
// stays readable and the diff on a data refresh is just the JSON.
const require = createRequire(import.meta.url);
const CITIES_BY_ISO2 = require("./cities.json") as Record<string, string[]>;


/**
 * A city's identity: country plus its accent-stripped, lower-cased name.
 *
 * Must match the identity the V1 -> V3 city resolver uses. A plain toLowerCase()
 * does not: 01_countries_seeder's dataset spells Croatia's cities without
 * diacritics ("Sibenik", "Varazdin") while this one spells them with
 * ("\u0160ibenik", "Vara\u017edin"), so lower-casing alone let both spellings in as
 * separate rows. The migration then collapsed each pair onto one key and Gate 2
 * failed with "duplicate TARGET identity keys" — but only on a freshly seeded
 * database, which is exactly what a cutover rehearsal is.
 */
function cityKey(name: string): string {
  return name.normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase();
}

export async function seed(knex: Knex): Promise<void> {
  const countries = await knex("countries").select("id", "iso2");
  const idByIso2 = new Map(countries.map((c) => [c.iso2, c.id]));

  for (const [iso2, names] of Object.entries(CITIES_BY_ISO2)) {
    const countryId = idByIso2.get(iso2);
    if (!countryId) {
      // Country not seeded — skip rather than fail; countries_seeder owns that set.
      console.warn(`cities_seeder: no country ${iso2}, skipping ${names.length} cities`);
      continue;
    }

    const existing = await knex("cities").where({ country_id: countryId }).pluck("name");
    const have = new Set(existing.map(cityKey));
    const missing = names
      .filter((name) => !have.has(cityKey(name)))
      .map((name) => ({ country_id: countryId, name }));

    if (missing.length) await knex("cities").insert(missing);
  }
}
