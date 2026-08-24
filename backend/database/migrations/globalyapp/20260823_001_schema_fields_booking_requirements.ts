import type { Knex } from "knex";

// Booking requirements for Other Service Categories.
//
// The questions a category asks are already rows in `schema_fields` — this only gives an admin the
// controls the booking form needs: an order they choose, the hint text a buyer reads, and the numeric
// or length bounds that "at least 1 passenger" means.
//
// Additive and defaulted throughout. `display_order` is backfilled from `id`, which is exactly the
// order every existing reader already used, so no category's fields move when this runs.

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("schema_fields", (t) => {
    t.integer("display_order").notNullable().defaultTo(0);
    t.text("placeholder").nullable();
    t.text("help_text").nullable();
    // Stored as text and coerced per type on read: one column instead of one per type.
    t.text("default_value").nullable();
    // { min, max, min_length, max_length, pattern } — all optional. Enforced in booking.service.ts,
    // not by a CHECK: the rules describe *answers*, which live in another table's jsonb.
    t.jsonb("validation").nullable();
  });

  await knex.raw("UPDATE schema_fields SET display_order = id");

  await knex.raw(`
    CREATE INDEX schema_fields_entity_order_idx
      ON schema_fields (entity_type, entity_id, display_order, id)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP INDEX IF EXISTS schema_fields_entity_order_idx");
  await knex.schema.alterTable("schema_fields", (t) => {
    t.dropColumn("display_order");
    t.dropColumn("placeholder");
    t.dropColumn("help_text");
    t.dropColumn("default_value");
    t.dropColumn("validation");
  });
}
