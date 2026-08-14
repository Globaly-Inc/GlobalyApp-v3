import type { Knex } from "knex";

/**
 * Split `service_categories` by who the category is for.
 *
 * The table has served two unrelated audiences since 20260722: businesses pick their "default services"
 * from it (via business_category_default_services), and — since 20260813_001 — a person selling through
 * Earn → My Services picks their listing's category from it too. One flat list means a category added for
 * businesses turns up in a student's dropdown, and vice versa. They are different taxonomies that happen to
 * share a shape.
 *
 * `scope` is the separator. It is deliberately not a second table: the columns, the admin CRUD screen and
 * the schema-fields machinery are all identical, so a second table would be the same table twice.
 *
 * Defaults to 'business' and then promotes the seven slugs 20260813_001 seeded. Anything that existed
 * before this migration was created for the business side, because that was the only side using the table.
 */

const PERSONAL_SLUGS = [
  "airport_pickup",
  "city_orientation",
  "rental_support",
  "employment_support",
  "assignment_help",
  "private_tutoring",
  "other",
];

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("service_categories", (t) => {
    t.text("scope").notNullable().defaultTo("business");
  });

  await knex.raw(`
    ALTER TABLE service_categories
      ADD CONSTRAINT service_categories_scope_chk CHECK (scope IN ('business', 'personal'))
  `);

  await knex("service_categories").whereIn("slug", PERSONAL_SLUGS).update({ scope: "personal" });

  // Both readers filter on scope and skip retired rows; this serves each of them.
  await knex.schema.alterTable("service_categories", (t) => {
    t.index(["scope", "is_active", "sort_order"], "service_categories_scope_idx");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("service_categories", (t) => {
    t.dropIndex(["scope", "is_active", "sort_order"], "service_categories_scope_idx");
  });
  await knex.raw(`ALTER TABLE service_categories DROP CONSTRAINT IF EXISTS service_categories_scope_chk`);
  await knex.schema.alterTable("service_categories", (t) => {
    t.dropColumn("scope");
  });
}
