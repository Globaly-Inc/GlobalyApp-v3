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
    t.text("username").unique().notNullable();
    t.text("refresh_token").nullable();
    t.uuid("refresh_token_family").nullable();
    t.text("otp").nullable(); 
    t.timestamp("otp_expires_at").nullable();
    t.integer("otp_attempts").notNullable().defaultTo(0);
    t.timestamp("otp_locked_until").nullable();
    t.integer("account_status").notNullable().defaultTo(0); // 0=inactive until OTP verified, 1=active
    t.text("photo_url").nullable();
    t.boolean("is_email_verified").notNullable().defaultTo(false);
    t.text("user_category").nullable();     // 'personal' | 'business'
    t.text("user_sub_category").nullable(); // personal: 'student'|'education_provider'|'parents'|'explorer' — business: 'education_agent'|'institution'|'service_provider'|'immigration_department'
    t.text("ip_address").nullable();        // last login IP — bound to refresh token
    t.text("user_agent").nullable();        // last login user-agent — bound to refresh token
    t.timestamp("last_login_at").nullable();
    t.jsonb("meta").defaultTo("{}");
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("platform_users");
}
