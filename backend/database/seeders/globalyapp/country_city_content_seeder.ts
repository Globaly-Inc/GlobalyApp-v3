import type { Knex } from "knex";
import countryContent from "./data/country-content.json";
import cityContent from "./data/city-content.json";

type CountryContent = { iso2: string } & Record<string, unknown>;
type CityContent = { country_iso2: string; slug: string } & Record<string, unknown>;

export async function seed(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    for (const { iso2, ...content } of countryContent as CountryContent[]) {
      await trx("countries").where({ iso2 }).whereNull("about").update(content);
    }

    const countryIdByIso2 = new Map(
      (await trx("countries").select("id", "iso2") as { id: number; iso2: string }[]).map((r) => [r.iso2, r.id]),
    );

    for (const { country_iso2, slug, ...content } of cityContent as CityContent[]) {
      const country_id = countryIdByIso2.get(country_iso2);
      if (!country_id) continue;
      await trx("cities").where({ country_id, slug }).whereNull("about").update(content);
    }
  });
}
