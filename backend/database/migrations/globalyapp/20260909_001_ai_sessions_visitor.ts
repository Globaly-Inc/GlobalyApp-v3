import type { Knex } from "knex";

// Threaded sessions for anonymous embed-widget visitors.
//
// Reuses ai_counselor_sessions + ai_counselor_messages rather than adding a parallel
// pair of tables: messages already key only on session_id, so the whole message layer,
// history window and card/chip parsing work unchanged, and a visitor who later signs up
// is adopted by setting platform_user_id instead of copying rows between tables.
//
// platform_user_id becomes nullable and `visitor_key` appears alongside it — exactly one
// is set, enforced by a CHECK so neither an ownerless session nor a session owned twice
// can exist. visitor_key is a hash of the browser fingerprint AND the embed key, so one
// browser gets a SEPARATE thread per university and no thread is shared across widgets.
export async function up(knex: Knex): Promise<void> {
  // Raw DROP NOT NULL rather than knex's .alter(): .alter() rebuilds the column from the
  // builder's own definition, which would silently drop the existing FK to platform_users.
  await knex.raw(`ALTER TABLE ai_counselor_sessions ALTER COLUMN platform_user_id DROP NOT NULL`);
  await knex.schema.alterTable("ai_counselor_sessions", (t) => {
    t.text("visitor_key").nullable();
  });

  await knex.raw(`
    ALTER TABLE ai_counselor_sessions
    ADD CONSTRAINT ai_sessions_one_owner CHECK (
      (platform_user_id IS NULL) <> (visitor_key IS NULL)
    )
  `);

  // One live thread per visitor per widget. Partial on deleted_at so a soft-deleted
  // thread doesn't block the visitor from starting a fresh one.
  await knex.raw(`
    CREATE UNIQUE INDEX idx_ai_sessions_visitor
    ON ai_counselor_sessions (visitor_key, embed_config_id)
    WHERE visitor_key IS NOT NULL AND deleted_at IS NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS idx_ai_sessions_visitor`);
  await knex.raw(`ALTER TABLE ai_counselor_sessions DROP CONSTRAINT IF EXISTS ai_sessions_one_owner`);
  // Visitor sessions have no owning user, so they cannot survive the column going
  // back to NOT NULL — drop them rather than fail the rollback on existing rows.
  await knex("ai_counselor_sessions").whereNotNull("visitor_key").del();
  await knex.schema.alterTable("ai_counselor_sessions", (t) => {
    t.dropColumn("visitor_key");
  });
  await knex.raw(`ALTER TABLE ai_counselor_sessions ALTER COLUMN platform_user_id SET NOT NULL`);
}
