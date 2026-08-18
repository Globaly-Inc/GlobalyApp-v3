// Realigns four tables whose CREATE TABLE migrations were edited in place after they had already
// been applied. knex never re-runs an applied migration, so those columns exist on any database built
// from scratch and are missing on every database that predates the edits — this migration closes that
// gap without a rebuild.
//
// Sources, column-for-column: 20260722_001_countries.ts (countries, cities) and
// 20260804_001_businesses.ts (businesses), 20260818_001_credit_ledger.ts (credit_transactions,
// which gained balance_type when the wallet tables were folded into it). The definitions below are
// copied from those files, so a
// scratch build and a patched build end up with identical schemas.
//
// ponytail: every add is guarded by hasColumn rather than assumed missing, so this is a no-op on a
// scratch-built database and safe to run anywhere. Same for the two unique indexes, via IF NOT EXISTS.

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await addMissing(knex, "countries", {
    slug: (t) => t.text("slug").nullable(),
    flag_emoji: (t) => t.text("flag_emoji").nullable(),
    capital: (t) => t.text("capital").nullable(),
    languages: (t) => t.specificType("languages", "text[]").nullable(),
    timezone: (t) => t.text("timezone").nullable(),
    population: (t) => t.integer("population").nullable(),
    area_km2: (t) => t.integer("area_km2").nullable(),
    about: (t) => t.text("about").nullable(),
    why_study_here: (t) => t.text("why_study_here").nullable(),
    hero_image_url: (t) => t.text("hero_image_url").nullable(),
    thumbnail_image_url: (t) => t.text("thumbnail_image_url").nullable(),
    gallery_images: (t) => t.specificType("gallery_images", "text[]").notNullable().defaultTo("{}"),
    youtube_embed_url: (t) => t.text("youtube_embed_url").nullable(),
    visa_type: (t) => t.text("visa_type").nullable(),
    visa_description: (t) => t.text("visa_description").nullable(),
    visa_processing_time: (t) => t.text("visa_processing_time").nullable(),
    visa_fee: (t) => t.text("visa_fee").nullable(),
    avg_tuition_min: (t) => t.decimal("avg_tuition_min", 12, 2).nullable(),
    avg_tuition_max: (t) => t.decimal("avg_tuition_max", 12, 2).nullable(),
    avg_tuition_currency: (t) => t.text("avg_tuition_currency").nullable(),
    student_count_label: (t) => t.text("student_count_label").nullable(),
    universities_count_label: (t) => t.text("universities_count_label").nullable(),
    cost_of_living_label: (t) => t.text("cost_of_living_label").nullable(),
    work_rights_label: (t) => t.text("work_rights_label").nullable(),
    weather_summer: (t) => t.jsonb("weather_summer").nullable(),
    weather_autumn: (t) => t.jsonb("weather_autumn").nullable(),
    weather_winter: (t) => t.jsonb("weather_winter").nullable(),
    weather_spring: (t) => t.jsonb("weather_spring").nullable(),
    is_featured: (t) => t.boolean("is_featured").notNullable().defaultTo(false),
    sort_order: (t) => t.integer("sort_order").notNullable().defaultTo(0),
    meta_title: (t) => t.text("meta_title").nullable(),
    meta_description: (t) => t.text("meta_description").nullable(),
  });

  await addMissing(knex, "cities", {
    slug: (t) => t.text("slug").nullable(),
    hero_image_url: (t) => t.text("hero_image_url").nullable(),
    thumbnail_image_url: (t) => t.text("thumbnail_image_url").nullable(),
    about: (t) => t.text("about").nullable(),
    population_label: (t) => t.text("population_label").nullable(),
    area_label: (t) => t.text("area_label").nullable(),
    weather_label: (t) => t.text("weather_label").nullable(),
    timezone: (t) => t.text("timezone").nullable(),
    highlights: (t) => t.specificType("highlights", "text[]").notNullable().defaultTo("{}"),
    is_featured: (t) => t.boolean("is_featured").notNullable().defaultTo(false),
    sort_order: (t) => t.integer("sort_order").notNullable().defaultTo(0),
    status: (t) => t.text("status").notNullable().defaultTo("active"), // active | pending | rejected
    suggested_by: (t) => t.integer("suggested_by").unsigned().nullable(), // platform_users.id — no FK: platform_users migrates after this table
    meta_title: (t) => t.text("meta_title").nullable(),
    meta_description: (t) => t.text("meta_description").nullable(),
  });

  await addMissing(knex, "businesses", {
    profile_views: (t) => t.integer("profile_views").notNullable().defaultTo(0),
    enquiry_enabled: (t) => t.boolean("enquiry_enabled").notNullable().defaultTo(true),
    enquiry_coin_cost: (t) => t.integer("enquiry_coin_cost").notNullable().defaultTo(30),
    enquiry_max_distributions: (t) => t.integer("enquiry_max_distributions").notNullable().defaultTo(5),
    latitude: (t) => t.decimal("latitude", 10, 7).nullable(),
    longitude: (t) => t.decimal("longitude", 10, 7).nullable(),
    claim_status: (t) => t.text("claim_status").notNullable().defaultTo("unclaimed"),
    claim_token: (t) => t.text("claim_token").nullable(),
    claim_token_expires_at: (t) => t.timestamp("claim_token_expires_at").nullable(),
  });

  // cities.created_at / updated_at come from t.timestamps(true, true) in the source migration.
  await addMissing(knex, "cities", {
    created_at: (t) => t.timestamp("created_at").notNullable().defaultTo(knex.fn.now()),
    updated_at: (t) => t.timestamp("updated_at").notNullable().defaultTo(knex.fn.now()),
  });

  // credit_transactions — the wallet fold-in added balance_type and four kinds to a migration that
  // had already run here. Constraints are dropped-then-added because Postgres has no
  // ADD CONSTRAINT IF NOT EXISTS; both statements are no-ops in effect on an up-to-date database.
  await addMissing(knex, "credit_transactions", {
    balance_type: (t) => t.text("balance_type").notNullable().defaultTo("free"),
  });

  await knex.raw(`
    ALTER TABLE credit_transactions
      DROP CONSTRAINT IF EXISTS credit_tx_kind_check,
      DROP CONSTRAINT IF EXISTS credit_tx_balance_type_check
  `);
  await knex.raw(`
    ALTER TABLE credit_transactions
      ADD CONSTRAINT credit_tx_kind_check CHECK (
        kind IN (
          'referral_reward', 'referral_reversal', 'purchase', 'manual_adjustment',
          'ai_message', 'signup_grant', 'subscription_grant', 'admin_grant'
        )
      ),
      ADD CONSTRAINT credit_tx_balance_type_check CHECK (
        balance_type IN ('free', 'subscription', 'purchased')
      )
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS credit_tx_one_signup_grant
      ON credit_transactions (owner_type, owner_id)
      WHERE kind = 'signup_grant'
  `);
  // Uniques declared alongside the new slug columns. Raw, because knex has no IF NOT EXISTS here.
  await knex.raw("CREATE UNIQUE INDEX IF NOT EXISTS countries_slug_unique ON countries (slug)");
  await knex.raw("CREATE UNIQUE INDEX IF NOT EXISTS cities_country_id_slug_unique ON cities (country_id, slug)");
}

/**
 * Adds only the columns the table does not already have.
 *
 * One alterTable for the whole table, so a wide gap costs a single DDL statement — and a table that is
 * already current issues none at all.
 */
async function addMissing(
  knex: Knex,
  table: string,
  defs: Record<string, (t: Knex.AlterTableBuilder) => unknown>,
): Promise<void> {
  const missing: string[] = [];
  for (const name of Object.keys(defs)) {
    if (!(await knex.schema.hasColumn(table, name))) missing.push(name);
  }
  if (!missing.length) return;
  await knex.schema.alterTable(table, (t) => {
    for (const name of missing) defs[name](t);
  });
}

// Deliberately no down(): these columns belong to the original CREATE TABLE migrations, and dropping
// them would leave a database that no longer matches ANY migration state. Roll back those instead.
export async function down(): Promise<void> {}
