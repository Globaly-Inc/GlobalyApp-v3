import type { Knex } from "knex";

/**
 * Narrows the course schema fields to the one category that is actually a course, and adds the
 * third one the editor offers.
 *
 * 20260917_001 gave Degree level and Area of study to every service category, because the editor
 * rendered its Course details card whatever the category was. The editor now gates that card —
 * and the Intakes/Eligibility/Study Options/Study Units/Accreditations tabs — on the `courses`
 * slug, the same single hardcoded gate V1's BusinessServiceEditor and the superadmin editor use.
 * So the rows on Accommodation, Insurance, Transport and the rest are unreachable, and asking an
 * admin to look at "Degree level" on Insurance in the schema-fields editor is just noise.
 *
 * Additive only. See the note at the end of `up` for why the matching cleanup was dropped.
 *
 * On a fresh database this is a no-op: `service_categories` is populated by a seeder, which runs
 * after migrations. service_categories_seeder.ts owns the same three fields and is what actually
 * guarantees them in every environment; this migration only backfills a database that was already
 * seeded before the fields existed.
 */
const COURSE_SLUG = "courses";

const COURSE_FIELDS = [
  { key: "degree_level", label: "Degree level" },
  { key: "area_of_study", label: "Area of study" },
  // Third field on the editor's Course details card — the awarding institution.
  { key: "awarded_by", label: "Awarded by" },
];

export async function up(knex: Knex): Promise<void> {
  const courses = await knex("service_categories").where({ slug: COURSE_SLUG }).whereNull("deleted_at").first("id");

  if (courses) {
    await knex("schema_fields")
      .insert(COURSE_FIELDS.map((field) => ({
        entity_id: courses.id,
        entity_type: "service_categories",
        is_default: true,
        label: field.label,
        key: field.key,
        type: "text",
        is_required: false,
        filterable: true,
      })))
      .onConflict(["entity_id", "entity_type", "key"])
      .ignore();
  }

  // This used to delete the same fields from every non-course category, for tidiness in the
  // superadmin schema-fields editor. Removed: schema_field_values has ON DELETE CASCADE, so any
  // tenant that had saved a degree level against, say, an Insurance service during the few days
  // 20260917_001's blanket fields were exposed would have lost it silently on upgrade. The rows
  // are unreachable anyway — the editor gates the Course details card on the category slug — so
  // a little clutter is the cheaper side of that trade.
}

export async function down(knex: Knex): Promise<void> {
  // Back to 20260917_001's state: degree_level + area_of_study on every category, no awarded_by.
  const categories = await knex("service_categories").whereNull("deleted_at").select("id");
  const restored = ["degree_level", "area_of_study"];

  if (categories.length > 0) {
    await knex("schema_fields")
      .insert(categories.flatMap((category: { id: number }) =>
        COURSE_FIELDS.filter((f) => restored.includes(f.key)).map((field) => ({
          entity_id: category.id,
          entity_type: "service_categories",
          is_default: true,
          label: field.label,
          key: field.key,
          type: "text",
          is_required: false,
          filterable: true,
        })),
      ))
      .onConflict(["entity_id", "entity_type", "key"])
      .ignore();
  }

  await knex("schema_fields")
    .where({ entity_type: "service_categories", is_default: true, key: "awarded_by" })
    .delete();
}
