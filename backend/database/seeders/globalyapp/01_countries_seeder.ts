import type { Knex } from "knex";
import countries from "./data/world-countries.json";
import cities from "./data/world-cities.json";

const CITY_BATCH_SIZE = 300;

function chunk<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

// All 194 sovereign states (independent || unMember), sourced from mledoze/countries
// (https://github.com/mledoze/countries — the same flags restcountries.com's default
// "all countries" view uses), plus each country's top 15 cities by population from
// GeoNames' cities15000 dataset. Upserts on iso2 / (country_id, slug) so re-running this
// seeder refreshes reference fields without touching admin-entered content (about, images,
// weather, is_featured, sort_order, etc. are never part of these payloads).
export async function seed(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    await trx("countries").insert(countries).onConflict("iso2").merge();

    const rows: { id: number; iso2: string }[] = await trx("countries").select("id", "iso2");
    const countryIdByIso2 = new Map(rows.map((r) => [r.iso2, r.id]));

    const cityRows = cities
      .map((c) => {
        const country_id = countryIdByIso2.get(c.country_iso2);
        if (!country_id) return null;
        return {
          country_id,
          name: c.name,
          slug: c.slug,
          timezone: c.timezone,
          population_label: c.population ? c.population.toLocaleString("en-US") : null,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    for (const batch of chunk(cityRows, CITY_BATCH_SIZE)) {
      await trx("cities").insert(batch).onConflict(["country_id", "slug"]).merge();
    }
  });
}
