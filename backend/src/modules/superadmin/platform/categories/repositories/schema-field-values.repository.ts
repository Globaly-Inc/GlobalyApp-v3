// Tenant-schema repository — renames a field's key inside schema_field_values
// when the field's schema_fields.key changes, keeping stored values uniform.

import type { Knex } from "knex";

export async function renameFieldKey(db: Knex, entityType: "businesses" | "business_services", oldKey: string, newKey: string) {
  await db("schema_field_values")
    .where({ entity_type: entityType })
    .whereRaw("field_values ? ?", [oldKey])
    .update({
      field_values: db.raw(
        "(field_values - ?) || jsonb_build_object(?, field_values -> ?)",
        [oldKey, newKey, oldKey],
      ),
      updated_at: db.fn.now(),
    });
}
