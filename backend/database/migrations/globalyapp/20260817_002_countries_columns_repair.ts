import type { Knex } from "knex";

// Repairs environments where `20260722_001_countries.ts` was recorded as already-applied
// in `knex_migrations_globalyapp` before columns (e.g. `slug`) were added to that file —
// knex tracks migrations by filename, not content, so editing an already-run migration
// file silently does nothing on `migrate:latest`. This adds whatever's missing, idempotently,
// so it's safe to run regardless of which columns a given database already has.

const COUNTRY_COLUMNS: Array<[string, (t: Knex.TableBuilder) => void]> = [
  ["slug", (t) => t.text("slug").nullable()],
  ["flag_emoji", (t) => t.text("flag_emoji").nullable()],
  ["capital", (t) => t.text("capital").nullable()],
  ["languages", (t) => t.specificType("languages", "text[]").nullable()],
  ["timezone", (t) => t.text("timezone").nullable()],
  ["population", (t) => t.integer("population").nullable()],
  ["area_km2", (t) => t.integer("area_km2").nullable()],
  ["about", (t) => t.text("about").nullable()],
  ["why_study_here", (t) => t.text("why_study_here").nullable()],
  ["hero_image_url", (t) => t.text("hero_image_url").nullable()],
  ["thumbnail_image_url", (t) => t.text("thumbnail_image_url").nullable()],
  ["gallery_images", (t) => t.specificType("gallery_images", "text[]").notNullable().defaultTo("{}")],
  ["youtube_embed_url", (t) => t.text("youtube_embed_url").nullable()],
  ["visa_type", (t) => t.text("visa_type").nullable()],
  ["visa_description", (t) => t.text("visa_description").nullable()],
  ["visa_processing_time", (t) => t.text("visa_processing_time").nullable()],
  ["visa_fee", (t) => t.text("visa_fee").nullable()],
  ["avg_tuition_min", (t) => t.decimal("avg_tuition_min", 12, 2).nullable()],
  ["avg_tuition_max", (t) => t.decimal("avg_tuition_max", 12, 2).nullable()],
  ["avg_tuition_currency", (t) => t.text("avg_tuition_currency").nullable()],
  ["student_count_label", (t) => t.text("student_count_label").nullable()],
  ["universities_count_label", (t) => t.text("universities_count_label").nullable()],
  ["cost_of_living_label", (t) => t.text("cost_of_living_label").nullable()],
  ["work_rights_label", (t) => t.text("work_rights_label").nullable()],
  ["weather_summer", (t) => t.jsonb("weather_summer").nullable()],
  ["weather_autumn", (t) => t.jsonb("weather_autumn").nullable()],
  ["weather_winter", (t) => t.jsonb("weather_winter").nullable()],
  ["weather_spring", (t) => t.jsonb("weather_spring").nullable()],
  ["is_featured", (t) => t.boolean("is_featured").notNullable().defaultTo(false)],
  ["sort_order", (t) => t.integer("sort_order").notNullable().defaultTo(0)],
  ["meta_title", (t) => t.text("meta_title").nullable()],
  ["meta_description", (t) => t.text("meta_description").nullable()],
  ["deleted_at", (t) => t.timestamp("deleted_at").nullable()],
];

const CITY_COLUMNS: Array<[string, (t: Knex.TableBuilder) => void]> = [
  ["slug", (t) => t.text("slug").nullable()],
  ["hero_image_url", (t) => t.text("hero_image_url").nullable()],
  ["thumbnail_image_url", (t) => t.text("thumbnail_image_url").nullable()],
  ["about", (t) => t.text("about").nullable()],
  ["population_label", (t) => t.text("population_label").nullable()],
  ["area_label", (t) => t.text("area_label").nullable()],
  ["weather_label", (t) => t.text("weather_label").nullable()],
  ["timezone", (t) => t.text("timezone").nullable()],
  ["highlights", (t) => t.specificType("highlights", "text[]").notNullable().defaultTo("{}")],
  ["is_featured", (t) => t.boolean("is_featured").notNullable().defaultTo(false)],
  ["sort_order", (t) => t.integer("sort_order").notNullable().defaultTo(0)],
  ["status", (t) => t.text("status").notNullable().defaultTo("active")],
  ["suggested_by", (t) => t.integer("suggested_by").unsigned().nullable()],
  ["meta_title", (t) => t.text("meta_title").nullable()],
  ["meta_description", (t) => t.text("meta_description").nullable()],
  ["deleted_at", (t) => t.timestamp("deleted_at").nullable()],
];

async function addMissingColumns(
  knex: Knex,
  table: string,
  columns: Array<[string, (t: Knex.TableBuilder) => void]>,
) {
  for (const [name, add] of columns) {
    if (!(await knex.schema.hasColumn(table, name))) {
      await knex.schema.alterTable(table, add);
    }
  }
}

export async function up(knex: Knex): Promise<void> {
  await addMissingColumns(knex, "countries", COUNTRY_COLUMNS);
  await addMissingColumns(knex, "cities", CITY_COLUMNS);

  // These two unique constraints only make sense once `slug` exists on both tables —
  // skip if already present (e.g. on a fresh DB where the original migration ran in full).
  const hasCountrySlugUnique = await knex.raw(
    `select 1 from pg_constraint where conname = 'countries_slug_unique'`,
  );
  if (hasCountrySlugUnique.rows.length === 0) {
    await knex.schema.alterTable("countries", (t) => t.unique(["slug"]));
  }
  const hasCitySlugUnique = await knex.raw(
    `select 1 from pg_constraint where conname = 'cities_country_id_slug_unique'`,
  );
  if (hasCitySlugUnique.rows.length === 0) {
    await knex.schema.alterTable("cities", (t) => t.unique(["country_id", "slug"]));
  }
}

export async function down(): Promise<void> {
  // No-op: this migration only backfills columns the current schema already expects to
  // exist unconditionally elsewhere in the codebase — dropping them on rollback would
  // break the app the same way missing them did, so there's nothing safe to reverse.
}
