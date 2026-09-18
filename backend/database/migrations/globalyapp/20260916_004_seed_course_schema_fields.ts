import type { Knex } from "knex";

// Seeds the three standard "Course details" fields (degree_level, area_of_study, awarded_by)
// onto every service category, so the service form's Course details combobox writes/reads a
// real per-category schema_fields id instead of nothing — no category has ever had these
// defined (there's a backend endpoint to manage schema_fields, but no admin UI was ever built
// for it), so selecting a degree level/area of study previously silently did nothing.
const FIELDS = [
  { key: "degree_level", label: "Degree level" },
  { key: "area_of_study", label: "Area of study" },
  { key: "awarded_by", label: "Awarded by" },
];

export async function up(knex: Knex): Promise<void> {
  const categories = await knex("service_categories").select("id");
  const rows = categories.flatMap((c) =>
    FIELDS.map((f) => ({
      entity_id: c.id,
      entity_type: "service_categories",
      is_default: true,
      label: f.label,
      key: f.key,
      type: "text",
      is_required: false,
      filterable: false,
      options: null,
    })),
  );
  if (rows.length > 0) {
    await knex("schema_fields").insert(rows).onConflict(["entity_id", "entity_type", "key"]).ignore();
  }
}

export async function down(): Promise<void> {
  // No-op: up() uses onConflict().ignore() to preserve any pre-existing field with the same
  // (entity_id, entity_type, key), so we can't tell which rows this migration actually created.
  // Deleting by key/is_default alone would also destroy those pre-existing fields (and, via
  // cascade, the service values referencing them).
}
