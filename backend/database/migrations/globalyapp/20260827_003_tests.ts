import type { Knex } from "knex";

/**
 * Platform catalogue of standardised tests — IELTS, TOEFL, GRE, SAT … — managed from
 * Superadmin ▸ Platform ▸ Categories ▸ Tests.
 *
 * `category` is the academic/language split the admin picks; it is NOT the same thing as the
 * `test_type` column on `platform_user_language_tests` / `platform_user_academic_tests`, which
 * holds the test's *name* as free text. Course and profile surfaces resolve their free-text
 * names against `name` here to find the logo, so no column on those tables changes.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("tests", (t) => {
    t.increments("id").primary();
    t.text("name").notNullable().unique();
    t.text("slug").notNullable().unique();
    t.text("category").notNullable();
    t.text("image_url").nullable();
    t.integer("sort_order").notNullable().defaultTo(0);
    t.boolean("is_active").notNullable().defaultTo(true);
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
    t.check("category in ('academic', 'language')", undefined, "tests_category_check");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("tests");
}
