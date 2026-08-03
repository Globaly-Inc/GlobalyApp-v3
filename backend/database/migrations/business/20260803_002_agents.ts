import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("agents", (t) => {
    t.increments("id").primary();
    t.uuid("uuid").unique().notNullable().defaultTo(knex.raw("gen_random_uuid()"));
    t.text("first_name").notNullable();
    t.text("last_name").notNullable();
    t.text("display_name").nullable();
    t.text("email").unique().notNullable();
    t.text("phone").nullable();
    t.text("username").unique().notNullable();
    t.integer("role_id").unsigned().notNullable().references("id").inTable("roles");
    t.text("refresh_token").nullable();
    t.text("otp").nullable();
    t.timestamp("otp_expires_at").nullable();
    t.integer("account_status").notNullable().defaultTo(1);
    t.text("photo_url").nullable();
    t.boolean("is_owner").notNullable().defaultTo(false);
    t.integer("added_by").unsigned().nullable().references("id").inTable("agents");
    t.boolean("is_email_verified").notNullable().defaultTo(false);
    t.jsonb("meta").defaultTo("{}");
    t.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("agents");
}
