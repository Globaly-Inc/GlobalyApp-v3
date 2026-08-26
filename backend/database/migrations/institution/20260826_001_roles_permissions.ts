import type { Knex } from "knex";

// Mirrors the business schema's roles/permissions/role_permissions (20260803_001 + _004) so
// institutions get the same Settings → Roles management. Default data lives in
// seeders/institution/roles_seeder.ts — seeded at provisioning for new tenants and by
// migrate:tenants (which runs seeders after migrations) for existing ones.
//
// members.role keeps holding the role NAME (text) — no role_id FK — so existing members,
// invitations (user_details->>'role') and requireInstitutionRole keep working unchanged.

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("roles", (t) => {
    t.increments("id").primary();
    t.text("name").unique().notNullable();
    t.text("display_name").notNullable();
    t.text("description").nullable();
    t.boolean("is_system").notNullable().defaultTo(false); // true = cannot be edited/deleted
    t.integer("sort_order").notNullable().defaultTo(0);
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
  });

  await knex.schema.createTable("permissions", (t) => {
    t.increments("id").primary();
    t.text("module").notNullable();
    t.text("action").notNullable();
    t.text("display_name").notNullable();
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
  await knex.schema.dropTableIfExists("roles");
}
