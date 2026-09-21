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
 * Only rows this platform created (is_default) are removed, so a field an admin added by hand
 * survives. Deleting a schema_fields row cascades to any stored schema_field_values, which is why
 * this is scoped that tightly.
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

  await knex("schema_fields")
    .where({ entity_type: "service_categories", is_default: true })
    .whereIn("key", COURSE_FIELDS.map((f) => f.key))
    .whereNotIn("entity_id", knex("service_categories").where({ slug: COURSE_SLUG }).select("id"))
    .delete();
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
