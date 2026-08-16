import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("countries", (t) => {
    t.increments("id").primary();
    t.text("name").unique().notNullable();
    t.text("iso2").unique().notNullable();     // e.g. "AU"
    t.text("iso3").unique().notNullable();     // e.g. "AUS"
    t.text("phone_code").nullable();           // e.g. "+61"
    t.text("currency").nullable();             // e.g. "AUD"
    t.text("currency_symbol").nullable();      // e.g. "$"
    t.text("region").nullable();               // e.g. "Oceania"
    t.boolean("is_active").notNullable().defaultTo(true);
    t.text("slug").nullable();
    t.text("flag_emoji").nullable();
    t.text("capital").nullable();
    t.specificType("languages", "text[]").nullable();
    t.text("timezone").nullable();
    t.integer("population").nullable();
    t.integer("area_km2").nullable();
    t.text("about").nullable();
    t.text("why_study_here").nullable();
    t.text("hero_image_url").nullable();
    t.text("thumbnail_image_url").nullable();
    t.specificType("gallery_images", "text[]").notNullable().defaultTo("{}");
    t.text("youtube_embed_url").nullable();
    t.text("visa_type").nullable();
    t.text("visa_description").nullable();
    t.text("visa_processing_time").nullable();
    t.text("visa_fee").nullable();
    t.decimal("avg_tuition_min", 12, 2).nullable();
    t.decimal("avg_tuition_max", 12, 2).nullable();
    t.text("avg_tuition_currency").nullable();
    t.text("student_count_label").nullable();
    t.text("universities_count_label").nullable();
    t.text("cost_of_living_label").nullable();
    t.text("work_rights_label").nullable();
    t.jsonb("weather_summer").nullable();
    t.jsonb("weather_autumn").nullable();
    t.jsonb("weather_winter").nullable();
    t.jsonb("weather_spring").nullable();
    t.boolean("is_featured").notNullable().defaultTo(false);
    t.integer("sort_order").notNullable().defaultTo(0);
    t.text("meta_title").nullable();
    t.text("meta_description").nullable();
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
    t.unique(["slug"]);
  });

  await knex.schema.createTable("cities", (t) => {
    t.increments("id").primary();
    t.integer("country_id").unsigned().notNullable().references("id").inTable("countries").onDelete("CASCADE");
    t.text("name").notNullable();
    t.text("state_name").nullable();
    t.text("slug").nullable();
    t.text("hero_image_url").nullable();
    t.text("thumbnail_image_url").nullable();
    t.text("about").nullable();
    t.text("population_label").nullable();
    t.text("area_label").nullable();
    t.text("weather_label").nullable();
    t.text("timezone").nullable();
    t.specificType("highlights", "text[]").notNullable().defaultTo("{}");
    t.boolean("is_featured").notNullable().defaultTo(false);
    t.integer("sort_order").notNullable().defaultTo(0);
    t.text("status").notNullable().defaultTo("active"); // active | pending | rejected
    t.integer("suggested_by").unsigned().nullable(); // platform_users.id — no FK: platform_users migrates after this table
    t.text("meta_title").nullable();
    t.text("meta_description").nullable();
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
    t.index(["country_id", "name"]);
    t.unique(["country_id", "slug"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("cities");
  await knex.schema.dropTableIfExists("countries");
}
