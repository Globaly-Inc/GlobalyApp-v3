import type { Knex } from "knex";

const S = "superadmin";

// Degree levels an extraction job is after, picked in step 2 of the new-extraction stepper.
// Holds public.degree_levels.slug values; NULL or empty means every level, which is what every
// job created before this column means — so there is nothing to backfill.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(S).alterTable("extraction_jobs", (t) => {
    t.specificType("degree_level_codes", "text[]").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema(S).alterTable("extraction_jobs", (t) => {
    t.dropColumn("degree_level_codes");
  });
}
