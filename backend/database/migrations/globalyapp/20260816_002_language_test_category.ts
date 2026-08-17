// M0.4 — V1 student_academic_tests (SAT/GRE/GMAT/ACT/LSAT, 9 rows) has the same
// shape as platform_user_language_tests. One discriminator column beats a second
// near-identical table.

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("platform_user_language_tests", (t) => {
    t.text("category")
      .notNullable()
      .defaultTo("language")
      .checkIn(["language", "academic"], "platform_user_language_tests_category_check");
  });
  // ADD COLUMN ... DEFAULT already backfills; explicit for intent.
  await knex("platform_user_language_tests").whereNull("category").update({ category: "language" });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("platform_user_language_tests", (t) => {
    t.dropColumn("category");
  });
}
