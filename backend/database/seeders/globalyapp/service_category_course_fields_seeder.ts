import type { Knex } from "knex";
import { STANDARD_COURSE_FIELDS } from "../../../src/modules/superadmin/platform/categories/services/categories.service.js";

// Backfills the three standard "Course details" fields (degree_level, area_of_study, awarded_by)
// onto every category that existed before createServiceCategory started applying them on
// creation — so the service form's Course details combobox writes/reads a real per-category
// schema_fields id instead of nothing (a category with no row for these silently drops the
// selection). Reuses STANDARD_COURSE_FIELDS rather than keeping its own copy of the list.
export async function seed(knex: Knex): Promise<void> {
  const categories = await knex("service_categories").select("id");
  const rows = categories.flatMap((c) =>
    STANDARD_COURSE_FIELDS.map((f) => ({
      entity_id: c.id,
      entity_type: "service_categories",
      is_default: true,
      label: f.label,
      key: f.key,
      type: f.type,
      is_required: false,
      filterable: false,
      options: null,
    })),
  );
  if (rows.length > 0) {
    await knex("schema_fields").insert(rows).onConflict(["entity_id", "entity_type", "key"]).ignore();
  }
}
