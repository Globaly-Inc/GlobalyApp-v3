import type { Knex } from "knex";

// An org's default currency follows its country unless one was chosen. Fills every still-blank
// businesses/institutions.currency from countries.currency; new rows get it on extraction and on
// a profile edit that sets the country (shared/country-currency.ts). Data-only — down() is a
// no-op: which currencies were blank before isn't recorded, and clearing them would undo owner picks.
export async function up(knex: Knex): Promise<void> {
  for (const table of ["businesses", "institutions"]) {
    await knex.raw(
      `UPDATE ${table} t SET currency = c.currency
         FROM countries c
        WHERE c.id = t.country_id AND c.currency IS NOT NULL AND coalesce(t.currency, '') = ''`,
    );
  }
}

export async function down(): Promise<void> {}
