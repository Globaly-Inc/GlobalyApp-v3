import type { Knex } from "knex";

/**
 * Gives every service category the two course fields the service editor's "Course details" card
 * expects: Degree level and Area of study.
 *
 * Those two are not columns on `business_services` (V1 had them as `degree_level_id` /
 * `area_of_study_id`; V3 models them as dynamic per-category fields). A value is written to
 * `schema_field_values` keyed by `schema_field_id`, so without a `schema_fields` row there is no
 * id to write against and the editor renders both pickers disabled, with "Not set up for this
 * category yet". Nothing seeded these rows, so that was every category on every environment.
 *
 * The card is rendered for every category, and V1 offered both on every service, so every
 * category gets them rather than a hand-picked few.
 *
 * `type` is "text", not "select": a select field must carry a non-empty `options` array
 * (SchemaFieldInputSchema's `requiresOptions` refine), and these two draw their options from the
 * `degree_levels` / `areas_of_study` catalogs instead — a copy in `options` would go stale. The
 * service editor keys off `key`, never `type`, so it renders the catalog picker either way.
 */
const COURSE_FIELDS = [
  { key: "degree_level", label: "Degree level" },
  { key: "area_of_study", label: "Area of study" },
];

export async function up(knex: Knex): Promise<void> {
  const categories = await knex("service_categories").whereNull("deleted_at").select("id");
  if (categories.length === 0) return;

  const rows = categories.flatMap((category: { id: number }) =>
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
  );

  // A category where an admin already added one of these by hand keeps their row untouched —
  // the (entity_id, entity_type, key) unique index is what makes that safe.
  await knex("schema_fields").insert(rows).onConflict(["entity_id", "entity_type", "key"]).ignore();
}

export async function down(knex: Knex): Promise<void> {
  // Scoped to is_default so a field an admin created by hand (is_default = false) survives a
  // rollback — this migration only ever inserts is_default rows.
  await knex("schema_fields")
    .where({ entity_type: "service_categories", is_default: true })
    .whereIn("key", COURSE_FIELDS.map((field) => field.key))
    .delete();
}
