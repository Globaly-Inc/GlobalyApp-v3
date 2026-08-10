import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("platform_users", (t) => {
    t.increments("id").primary();
    t.uuid("uuid").unique().notNullable().defaultTo(knex.raw("gen_random_uuid()"));
    t.text("first_name").notNullable();
    t.text("last_name").notNullable();
    t.text("display_name").nullable();
    t.text("email").unique().notNullable();
    t.text("phone").nullable();
    t.integer("account_status").notNullable().defaultTo(0); // 0=inactive until OTP verified, 1=active
    t.text("photo_url").nullable();
    t.boolean("is_email_verified").notNullable().defaultTo(false);
    t.boolean("is_personal_account").notNullable().defaultTo(false);
    t.boolean("is_business_account").notNullable().defaultTo(false);
    t.jsonb("account_categories").notNullable().defaultTo("[]"); // [{type:"personal",role:"student"}, {type:"business",role:"education_agent"}]
    // OTP, refresh tokens, sessions moved to auth_otp_challenges + auth_sessions tables
    t.jsonb("meta").defaultTo("{}");
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("platform_users");
}
