import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("ai_guest_chat_sessions", (t) => {
    t.increments("id").primary();
    t.text("fingerprint_hash").notNullable();
    t.text("message_content").nullable();
    t.text("response_content").nullable();
    t.jsonb("response_sources").nullable();
    t.integer("embed_config_id").unsigned().nullable()
      .references("id").inTable("ai_embed_configs").onDelete("SET NULL");
    t.integer("migrated_to_session_id").unsigned().nullable()
      .references("id").inTable("ai_counselor_sessions").onDelete("SET NULL");
    t.timestamp("expires_at").notNullable();
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`CREATE INDEX idx_ai_guest_sessions_fp ON ai_guest_chat_sessions (fingerprint_hash, expires_at)`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("ai_guest_chat_sessions");
}
