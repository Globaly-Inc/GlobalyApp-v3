// AI metering + business-scoped counsellor.
//
// ── ai_usage_events ──
// One row per *settled* AI turn. It is both the audit record (model, tokens,
// provider cost) and the exactly-once gate for the wallet debit: the debit and
// this row are written in the same transaction, and `idempotency_key` is UNIQUE.
// A second settlement of the same turn — a retry, a reconnect, a concurrent
// request replaying the same turn id — loses the insert and therefore never
// reaches the debit. No charge can exist without its usage row, and no usage row
// without its charge.
//
// `credits_charged` is what actually moved, not what was computed: the debit is
// clamped to the wallet's spendable balance so a turn already answered can never
// fail to settle and can never drive a wallet negative.
//
// `outcome` distinguishes a turn whose provider usage metadata we received
// ('complete') from one that died mid-stream ('interrupted'). Interrupted rows
// carry an estimate derived from the bytes actually delivered to the client —
// the provider never reported figures for a stream it did not finish.
//
// ── ai_counselor_sessions.owner_type / business_id ──
// The counsellor is reachable in two scopes. A personal chat is owned by the
// platform user and debits their user wallet; a business chat is owned by the
// business and debits the business wallet. credit_wallets is already polymorphic
// on exactly this axis (20260816_004), so the session carries the same pair and
// the wallet follows from the session, never from the request body.

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // ── session scope ──
  await knex.schema.alterTable("ai_counselor_sessions", (t) => {
    t.text("owner_type").notNullable().defaultTo("user");
    t.integer("business_id").unsigned().nullable()
      .references("id").inTable("businesses").onDelete("CASCADE");
  });

  await knex.raw(
    `ALTER TABLE ai_counselor_sessions
       ADD CONSTRAINT ai_sessions_owner_type_check CHECK (owner_type IN ('user', 'business'))`,
  );
  // platform_user_id stays NOT NULL on both: a business chat still has an author.
  // business_id is the discriminator, and it must agree with owner_type.
  await knex.raw(
    `ALTER TABLE ai_counselor_sessions
       ADD CONSTRAINT ai_sessions_owner_check CHECK (
         (owner_type = 'user' AND business_id IS NULL)
         OR (owner_type = 'business' AND business_id IS NOT NULL))`,
  );
  await knex.raw(
    `CREATE INDEX idx_ai_sessions_business
       ON ai_counselor_sessions (business_id, created_at DESC)
       WHERE business_id IS NOT NULL AND deleted_at IS NULL`,
  );

  // ── usage events ──
  await knex.schema.createTable("ai_usage_events", (t) => {
    t.increments("id").primary();

    // The settle-exactly-once gate. Minted per turn before the provider is called.
    t.text("idempotency_key").notNullable().unique();

    t.text("owner_type").notNullable();
    t.integer("platform_user_id").unsigned().nullable()
      .references("id").inTable("platform_users").onDelete("SET NULL");
    t.integer("business_id").unsigned().nullable()
      .references("id").inTable("businesses").onDelete("SET NULL");

    t.integer("session_id").unsigned().nullable()
      .references("id").inTable("ai_counselor_sessions").onDelete("SET NULL");
    t.integer("message_id").unsigned().nullable()
      .references("id").inTable("ai_counselor_messages").onDelete("SET NULL");

    t.text("provider").notNullable();
    t.text("model").notNullable();

    t.integer("prompt_tokens").notNullable().defaultTo(0);
    t.integer("completion_tokens").notNullable().defaultTo(0);
    t.integer("total_tokens").notNullable().defaultTo(0);
    // Provider cost in millionths of a USD — integer money, never a float.
    t.bigInteger("cost_micros").notNullable().defaultTo(0);
    t.integer("credits_charged").notNullable().defaultTo(0);

    t.text("outcome").notNullable();

    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.check("outcome IN ('complete', 'interrupted')", [], "ai_usage_events_outcome_check");
    t.check(
      "(owner_type = 'user' AND platform_user_id IS NOT NULL AND business_id IS NULL)" +
        " OR (owner_type = 'business' AND business_id IS NOT NULL)",
      [],
      "ai_usage_events_owner_check",
    );
    t.check(
      "prompt_tokens >= 0 AND completion_tokens >= 0 AND total_tokens >= 0" +
        " AND cost_micros >= 0 AND credits_charged >= 0",
      [],
      "ai_usage_events_non_negative_check",
    );
  });

  await knex.raw(
    `CREATE INDEX idx_ai_usage_user ON ai_usage_events (platform_user_id, created_at DESC)
       WHERE platform_user_id IS NOT NULL`,
  );
  await knex.raw(
    `CREATE INDEX idx_ai_usage_business ON ai_usage_events (business_id, created_at DESC)
       WHERE business_id IS NOT NULL`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("ai_usage_events");
  await knex.raw(`DROP INDEX IF EXISTS idx_ai_sessions_business`);
  await knex.raw(
    `ALTER TABLE ai_counselor_sessions
       DROP CONSTRAINT IF EXISTS ai_sessions_owner_check,
       DROP CONSTRAINT IF EXISTS ai_sessions_owner_type_check`,
  );
  await knex.schema.alterTable("ai_counselor_sessions", (t) => {
    t.dropColumn("business_id");
    t.dropColumn("owner_type");
  });
}
