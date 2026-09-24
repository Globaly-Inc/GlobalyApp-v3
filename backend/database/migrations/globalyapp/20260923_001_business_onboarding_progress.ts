import type { Knex } from "knex";

/**
 * Tracks the one onboarding-checklist step with no existing signal to read it from: whether the
 * owner has reviewed the courses/services extraction found. Every other step (extraction status,
 * AI widget existence/activity, team member count) is derived live from tables that already exist.
 *
 * Same shape as ai_embed_configs (20260909_002) / enquiry_distributions (20260827_005): two
 * nullable owner ids with a CHECK that exactly one is set, since a business and an institution
 * are separate tables with colliding id spaces.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("business_onboarding_progress", (t) => {
    t.increments("id").primary();
    t.integer("business_id").unsigned().nullable().references("id").inTable("businesses").onDelete("CASCADE");
    t.integer("institution_id").unsigned().nullable().references("id").inTable("institutions").onDelete("CASCADE");
    t.timestamp("reviewed_courses_at", { useTz: true }).nullable();
    t.timestamps(true, true);
  });

  await knex.raw(`
    ALTER TABLE business_onboarding_progress
      ADD CONSTRAINT chk_onboarding_progress_owner
      CHECK (num_nonnulls(business_id, institution_id) = 1)
  `);
  await knex.raw(
    "CREATE UNIQUE INDEX business_onboarding_progress_business_uniq ON business_onboarding_progress (business_id) WHERE business_id IS NOT NULL",
  );
  await knex.raw(
    "CREATE UNIQUE INDEX business_onboarding_progress_institution_uniq ON business_onboarding_progress (institution_id) WHERE institution_id IS NOT NULL",
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("business_onboarding_progress");
}
