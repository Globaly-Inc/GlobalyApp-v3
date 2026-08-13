import type { Knex } from "knex";

// Categories become data instead of a CHECK constraint.
//
// 20260812_001 pinned service_listings.category to seven hardcoded slugs. That is fine for an enum and wrong
// for a taxonomy someone administers: an admin adding a category in /admin/platform/categories could not use
// it, because the constraint would reject the write. So listings now point at service_categories — the table
// that already carries slug/name/description/icon/is_active/sort_order and already has a superadmin CRUD
// screen — and the constraint goes.
//
// The seven rows are inserted here rather than in a seeder. They are not sample data: they are the values the
// dropped CHECK used to enforce, so the schema change and the values it depends on have to travel together or
// a migrated database has a category picker with nothing in it.

const CATEGORIES = [
  { slug: "airport_pickup", name: "Airport Pickup", icon: "Plane", sort_order: 1 },
  { slug: "city_orientation", name: "City Orientation", icon: "Map", sort_order: 2 },
  { slug: "rental_support", name: "Rental Support", icon: "Home", sort_order: 3 },
  { slug: "employment_support", name: "Employment Setup & Support", icon: "Briefcase", sort_order: 4 },
  { slug: "assignment_help", name: "Assignment Help", icon: "FileText", sort_order: 5 },
  { slug: "private_tutoring", name: "Private Tutoring", icon: "GraduationCap", sort_order: 6 },
  { slug: "other", name: "Other", icon: "Package", sort_order: 7 },
];

export async function up(knex: Knex): Promise<void> {
  // Idempotent: service_categories may already carry rows from another source, and re-running must not
  // duplicate a slug (it is unique) or reset an admin's edits to name/icon.
  await knex("service_categories")
    .insert(CATEGORIES.map((c) => ({ ...c, is_active: true })))
    .onConflict("slug")
    .ignore();

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

  // Anything that somehow failed to match lands on "other" rather than blocking the NOT NULL below.
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
  await knex.raw(`
    ALTER TABLE service_listings
      ADD CONSTRAINT service_listings_category_chk
      CHECK (category IN (${CATEGORIES.map((c) => `'${c.slug}'`).join(", ")}))
  `);

  await knex.schema.alterTable("service_listings", (t) => {
    t.dropColumn("category_id");
  });
}
