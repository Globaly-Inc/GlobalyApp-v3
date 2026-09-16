import type { Knex } from "knex";

// Same shape as business/20260811_001_business_branches.ts, same table name — this lets the
// existing business-branches repository (business-branches.repository.ts) work unmodified for
// institutions too: every function there takes a generic (id, schemaName) pair and reads/writes
// "business_branches" with no business-specific column. Institutions had no campus/branch
// tenant table until now (an institution's own campuses previously only existed as a read-only
// scraped stand-in from the extraction catalog).
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("business_branches", (t) => {
    t.increments("id").primary();
    t.uuid("uuid").notNullable().unique().defaultTo(knex.raw("gen_random_uuid()"));
    t.text("name").notNullable();
    t.text("country").nullable();
    t.text("state").nullable();
    t.text("city").nullable();
    t.text("address").nullable();
    t.text("phone").nullable();
    t.text("email").nullable();
    t.boolean("is_primary").defaultTo(false);
    t.integer("linked_business_id").unsigned().nullable(); // unused for institutions today — kept for schema parity with the business table
    t.text("branch_type").notNullable().defaultTo("same_company");
    t.boolean("share_description").notNullable().defaultTo(false);
    t.jsonb("shared_services").nullable();
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("business_branches");
}
