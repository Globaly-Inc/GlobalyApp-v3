import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("ai_guest_chat_sessions", (t) => {
    t.text("ip_hash").nullable();
  });

  await knex.raw(
    `CREATE INDEX idx_ai_guest_sessions_ip ON ai_guest_chat_sessions (ip_hash, expires_at)`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS idx_ai_guest_sessions_ip`);
  await knex.schema.alterTable("ai_guest_chat_sessions", (t) => {
    t.dropColumn("ip_hash");
  });
}
