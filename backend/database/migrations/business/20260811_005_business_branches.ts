import type { Knex } from "knex";

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
    t.integer("linked_business_id").unsigned().nullable(); // app-level FK to master businesses.id — set when this branch is another registered business
    t.text("branch_type").notNullable().defaultTo("same_company"); // "same_company" | "subsidiary" | "franchise"
    t.boolean("share_description").notNullable().defaultTo(false);
    t.jsonb("shared_services").nullable();
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("business_branches");
}
