import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("accreditations", (t) => {
    t.increments("id").primary();
    t.text("name").notNullable();
    t.integer("issuing_organization_id").unsigned().nullable()
      .references("id").inTable("issuing_organizations").onDelete("SET NULL");
    t.text("website").nullable();
    t.text("description").nullable();
    t.integer("business_id").unsigned().nullable().references("id").inTable("businesses").onDelete("SET NULL");
    t.boolean("is_global").notNullable().defaultTo(false);
    t.text("status").notNullable().defaultTo("pending").checkIn(["pending", "approved", "rejected"], "accreditations_status_check");
    t.integer("sort_order").notNullable().defaultTo(0);
    t.integer("reviewed_by").unsigned().nullable();
    t.timestamp("reviewed_at").nullable();
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("accreditations");
}
