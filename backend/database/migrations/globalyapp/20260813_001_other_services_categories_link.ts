import type { Knex } from "knex";

// Categories become data instead of a CHECK constraint.
//
// 20260812_001 pinned service_listings.category to seven hardcoded slugs. That is fine for an enum and wrong
// for a taxonomy someone administers: an admin adding a category in /admin/platform/categories could not use
// it, because the constraint would reject the write. So listings now point at service_categories — the table
// that already carries slug/name/description/icon/is_active/sort_order and already has a superadmin CRUD
// screen — and the constraint goes.
//
// The category rows themselves live in database/seeders/globalyapp/other_service_categories_seeder.ts.
// They were inserted here originally so the schema change and the values it depends on travelled together;
// moved out on review, because a migration should change shape and a seeder should populate rows. The
// backfill below is a data *migration* rather than seeding — it carries existing listings across a column
// change — so it stays.

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("service_listings", (t) => {
    t.integer("category_id").unsigned().nullable().references("id").inTable("service_categories").onDelete("RESTRICT");
  });

  // Carry existing listings across by slug before the old column goes.
  await knex.raw(`
    UPDATE service_listings l
       SET category_id = c.id
      FROM service_categories c
     WHERE c.slug = l.category
  `);

  // Anything that somehow failed to match lands on "other" rather than blocking the NOT NULL below. On a
  // fresh database both this and the backfill above are no-ops: the listings table was created empty by the
  // previous migration, so there is nothing to carry across and nothing for NOT NULL to reject.
  await knex.raw(`
    UPDATE service_listings
       SET category_id = (SELECT id FROM service_categories WHERE slug = 'other')
     WHERE category_id IS NULL
  `);

  await knex.raw(`ALTER TABLE service_listings ALTER COLUMN category_id SET NOT NULL`);
  await knex.raw(`ALTER TABLE service_listings DROP CONSTRAINT IF EXISTS service_listings_category_chk`);
  await knex.schema.alterTable("service_listings", (t) => {
    t.dropColumn("category");
  });

  await knex.schema.alterTable("service_listings", (t) => {
    t.index(["category_id"], "service_listings_category_idx");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("service_listings", (t) => {
    t.dropIndex(["category_id"], "service_listings_category_idx");
    t.text("category").nullable();
  });

  await knex.raw(`
    UPDATE service_listings l
       SET category = c.slug
      FROM service_categories c
     WHERE c.id = l.category_id
  `);

  await knex.raw(`UPDATE service_listings SET category = 'other' WHERE category IS NULL`);
  await knex.raw(`ALTER TABLE service_listings ALTER COLUMN category SET NOT NULL`);
  // Inlined rather than shared with the seeder: this rebuilds the constraint exactly as 20260812_001 wrote
  // it, and it must keep saying that forever. Reading the list from anywhere that can change would make an
  // applied migration's rollback mean something different later.
  await knex.raw(`
    ALTER TABLE service_listings
      ADD CONSTRAINT service_listings_category_chk
      CHECK (category IN (
        'airport_pickup', 'city_orientation', 'rental_support', 'employment_support',
        'assignment_help', 'private_tutoring', 'other'
      ))
  `);

  await knex.schema.alterTable("service_listings", (t) => {
    t.dropColumn("category_id");
  });
}
