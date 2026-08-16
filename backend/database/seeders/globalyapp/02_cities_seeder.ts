import { createRequire } from "node:module";
import type { Knex } from "knex";

// City catalogue keyed by country ISO-2, extracted from the V1 cities table and
// filtered to the countries this app seeds. Data lives in JSON so the seeder
// stays readable and the diff on a data refresh is just the JSON.
const require = createRequire(import.meta.url);
const CITIES_BY_ISO2 = require("./cities.json") as Record<string, string[]>;

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
    const have = new Set(existing.map((n: string) => n.toLowerCase()));
    const missing = names
      .filter((name) => !have.has(name.toLowerCase()))
      .map((name) => ({ country_id: countryId, name }));

    if (missing.length) await knex("cities").insert(missing);
  }
}
