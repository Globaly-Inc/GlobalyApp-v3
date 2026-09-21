// The identifier a business quotes when it registers — an ABN in Australia, a UEN in Singapore.
// Lived in the frontend as COUNTRY_REGISTRATION_TYPES, so adding a country meant a deploy; it is
// admin-managed reference data now (Platform → Categories → Registration Types).

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("business_registration_types", (t) => {
    t.increments("id").primary();
    // Nullable on purpose: a NULL country is the generic fallback set — what a business in a
    // country with no rows of its own is offered (the old DEFAULT_REGISTRATION_TYPES).
    t.integer("country_id").unsigned().nullable()
      .references("id").inTable("countries").onDelete("CASCADE");
    t.text("code").notNullable();   // "ABN" — the value stored on the business
    t.text("label").notNullable();  // "ABN (11 digits)" — what the picker shows
    t.integer("sort_order").notNullable().defaultTo(0);
    t.boolean("is_active").notNullable().defaultTo(true);
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
  });

  // Not a plain composite unique: Postgres treats NULLs as distinct, so `(NULL, 'BRN')` could be
  // inserted any number of times and the fallback set would quietly grow duplicates. Named
  // because error-handler.plugin.ts maps PG 23505 by constraint name.
  await knex.raw(`
    CREATE UNIQUE INDEX business_registration_types_country_code_unique
      ON business_registration_types (COALESCE(country_id, 0), code)
      WHERE deleted_at IS NULL
  `);

  // The one query the business-facing endpoint makes.
  await knex.raw(`
    CREATE INDEX business_registration_types_lookup_idx
      ON business_registration_types (country_id, is_active, sort_order)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("business_registration_types");
}
