import type { Knex } from "knex";


export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("fee_types", (t) => {
    t.increments("id").primary();
    t.text("name").notNullable();
    t.text("slug").notNullable();
    t.integer("business_id").unsigned().nullable().references("id").inTable("businesses").onDelete("SET NULL");
    t.text("status").notNullable().defaultTo("pending").checkIn(["pending", "approved", "rejected"], "fee_types_status_check");
    t.boolean("is_global").notNullable().defaultTo(false);
    t.integer("sort_order").notNullable().defaultTo(0);
    t.integer("reviewed_by").unsigned().nullable();
    t.timestamp("reviewed_at").nullable();
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
  });
  await knex.raw(`CREATE UNIQUE INDEX fee_types_name_unique
    ON fee_types (lower(name)) WHERE deleted_at IS NULL`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("fee_types");
}
