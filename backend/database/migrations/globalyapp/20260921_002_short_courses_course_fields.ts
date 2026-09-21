import type { Knex } from "knex";

/**
 * Short Courses is a course too, so it gets the same Course details fields as Academic Courses.
 *
 * 20260921_001 narrowed these to the single `courses` slug, matching the hardcoded gate in V1's
 * editor and the superadmin one. That reading was too literal: a short course still has a degree
 * level, a subject area and an awarding body, and the editor now treats both slugs as courses
 * (COURSE_CATEGORY_SLUGS in the business profile feature's const). This restores the rows for
 * `short_courses` and adds `awarded_by`, which it never had.
 */
const COURSE_SLUGS = ["courses", "short_courses"];

const COURSE_FIELDS = [
  { key: "degree_level", label: "Degree level" },
  { key: "area_of_study", label: "Area of study" },
  { key: "awarded_by", label: "Awarded by" },
];

export async function up(knex: Knex): Promise<void> {
  const categories = await knex("service_categories").whereIn("slug", COURSE_SLUGS).whereNull("deleted_at").select("id");
  if (categories.length === 0) return;

  await knex("schema_fields")
    .insert(categories.flatMap((category: { id: number }) =>
      COURSE_FIELDS.map((field) => ({
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
    // Academic Courses already has all three from 20260921_001 — this only fills the gaps.
    .onConflict(["entity_id", "entity_type", "key"])
    .ignore();
}

export async function down(knex: Knex): Promise<void> {
  // Back to 20260921_001's state: the three fields on `courses` alone.
  await knex("schema_fields")
    .where({ entity_type: "service_categories", is_default: true })
    .whereIn("key", COURSE_FIELDS.map((f) => f.key))
    .whereIn("entity_id", knex("service_categories").where({ slug: "short_courses" }).select("id"))
    .delete();
}
