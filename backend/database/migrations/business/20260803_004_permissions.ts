import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("permissions", (t) => {
    t.increments("id").primary();
    t.text("module").notNullable();        // e.g. "agents", "business", "crm"
    t.text("action").notNullable();        // e.g. "read", "write", "delete"
    t.text("display_name").notNullable();  // e.g. "View Team Members"
    t.text("description").nullable();
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
    t.unique(["module", "action"]);
  });

  await knex.schema.createTable("role_permissions", (t) => {
    t.integer("role_id").unsigned().notNullable().references("id").inTable("roles").onDelete("CASCADE");
    t.integer("permission_id").unsigned().notNullable().references("id").inTable("permissions").onDelete("CASCADE");
    t.primary(["role_id", "permission_id"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("role_permissions");
  await knex.schema.dropTableIfExists("permissions");
}
