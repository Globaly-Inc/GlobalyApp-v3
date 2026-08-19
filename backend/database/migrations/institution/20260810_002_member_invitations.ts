import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("member_invitations", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.text("email").notNullable();
    t.jsonb("user_details").notNullable(); // { first_name, last_name, phone?, role }
    t.text("invite_token").unique().notNullable();
    t.integer("invited_by").unsigned().notNullable().references("id").inTable("members");
    t.text("status").notNullable().defaultTo("pending");
    t.timestamp("created_at").defaultTo(knex.fn.now());
    t.timestamp("expired_at").notNullable();
    t.timestamp("deleted_at").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("member_invitations");
}
