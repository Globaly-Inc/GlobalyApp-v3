import type { Knex } from "knex";

// Institution services were hardcoded to the "courses" category (institution-courses.repository.ts
// always reported coursesCategoryId()) because extraction_courses had nowhere to record a real
// pick — every institution service was assumed to be a scraped/academic course. Institutions can
// now also offer non-course services (e.g. Short Courses), so extraction_courses gains its own
// service_category_id, mirroring the business twin's schema_field_values-based category pick but
// stored directly since extraction_courses has no per-row dynamic-field table. Existing rows (every
// one of them a real scraped course) backfill to the "courses" category so nothing already public
// silently changes category.
const S = "superadmin";
const TABLE = "extraction_courses";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(S).alterTable(TABLE, (t) => {
    t.integer("service_category_id").nullable();
  });
  await knex.raw(`
    UPDATE ${S}.${TABLE} SET service_category_id = (
      SELECT id FROM public.service_categories WHERE slug = 'courses' AND deleted_at IS NULL LIMIT 1
    ) WHERE service_category_id IS NULL
  `);
  await knex.raw(`CREATE INDEX idx_extraction_courses_service_category ON ${S}.${TABLE} (service_category_id)`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS ${S}.idx_extraction_courses_service_category`);
  await knex.schema.withSchema(S).alterTable(TABLE, (t) => {
    t.dropColumn("service_category_id");
  });
}
