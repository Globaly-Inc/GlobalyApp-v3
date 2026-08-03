import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema("superadmin").createTable("admin_invitations", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.text("email").notNullable();
    t.text("name").notNullable();
    t.text("role").notNullable().defaultTo("admin");
    t.text("invite_token").unique().notNullable();
    t.integer("invited_by").unsigned().notNullable().references("id").inTable("superadmin.admin_users");
    t.text("status").notNullable().defaultTo("pending");
    t.timestamp("created_at").defaultTo(knex.fn.now());
    t.timestamp("expired_at").notNullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema("superadmin").dropTableIfExists("admin_invitations");
}
