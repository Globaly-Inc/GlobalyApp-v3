import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Ephemeral OTP challenges — separated from platform_users to avoid write contention on identity table.
  // Rows auto-expire; purge with: DELETE FROM auth_otp_challenges WHERE expires_at < now() - interval '1 hour'
  await knex.schema.createTable("auth_otp_challenges", (t) => {
    t.increments("id").primary();
    t.text("email").notNullable();
    t.text("otp_hash").notNullable();
    t.integer("attempts").notNullable().defaultTo(0);
    t.timestamp("locked_until", { useTz: true }).nullable();
    t.timestamp("expires_at", { useTz: true }).notNullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw("CREATE INDEX idx_otp_email ON auth_otp_challenges (email)");

  // Per-device sessions — one row per login, supports multi-device.
  // Refresh token rotation + family-based reuse detection per session.
  await knex.schema.createTable("auth_sessions", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.integer("platform_user_id").unsigned().notNullable().references("id").inTable("platform_users").onDelete("CASCADE");
    t.text("refresh_token_hash").notNullable();
    t.uuid("token_family").notNullable();
    t.text("ip_address").nullable();
    t.text("user_agent").nullable();
    t.text("device_label").nullable();
    t.timestamp("last_used_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("expires_at", { useTz: true }).notNullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw("CREATE INDEX idx_sessions_user ON auth_sessions (platform_user_id)");
  await knex.raw("CREATE INDEX idx_sessions_token ON auth_sessions (refresh_token_hash)");
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("auth_sessions");
  await knex.schema.dropTableIfExists("auth_otp_challenges");
}
