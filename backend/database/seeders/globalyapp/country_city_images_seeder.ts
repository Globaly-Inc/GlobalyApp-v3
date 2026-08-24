import type { Knex } from "knex";
import countryImages from "./data/country-images.json";
import cityImages from "./data/city-images.json";

type CountryImage = { iso2: string; hero_image_url: string; gallery_images: string[] };
type CityImage = { country_iso2: string; slug: string; hero_image_url: string; thumbnail_image_url: string | null };

export async function seed(knex: Knex): Promise<void> {
  for (const c of countryImages as CountryImage[]) {
    await knex("countries")
      .where({ iso2: c.iso2 })
      .whereNull("hero_image_url")
      .update({ hero_image_url: c.hero_image_url, gallery_images: c.gallery_images });
  }

  const countryIdByIso2 = new Map(
    (await knex("countries").select("id", "iso2") as { id: number; iso2: string }[]).map((r) => [r.iso2, r.id]),
  );

  for (const c of cityImages as CityImage[]) {
    const countryId = countryIdByIso2.get(c.country_iso2);
    if (!countryId) continue;
    await knex("cities")
      .where({ country_id: countryId, slug: c.slug })
      .whereNull("hero_image_url")
      .update({ hero_image_url: c.hero_image_url, thumbnail_image_url: c.thumbnail_image_url });
  }
}
