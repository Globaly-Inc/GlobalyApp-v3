import type { Knex } from "knex";

// Parallel to linked_business_id: an institution branch links a real institutions.id, not a
// businesses.id, so a second nullable FK column is needed rather than overloading the existing
// one. Added here too — unused for businesses today — for the same schema-parity reason
// linked_business_id was kept on the institution copy of this table (20260911_001).
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("business_branches", (t) => {
    t.integer("linked_institution_id").unsigned().nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("business_branches", (t) => {
    t.dropColumn("linked_institution_id");
  });
}
