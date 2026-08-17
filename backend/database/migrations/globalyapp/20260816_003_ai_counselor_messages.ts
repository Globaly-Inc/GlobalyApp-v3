import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("ai_counselor_messages", (t) => {
    t.increments("id").primary();
    t.integer("session_id").unsigned().notNullable().references("id").inTable("ai_counselor_sessions").onDelete("CASCADE");
    t.text("role").notNullable();
    t.text("content").notNullable();
    t.jsonb("sources").notNullable().defaultTo("[]");
    t.jsonb("cards").notNullable().defaultTo("[]");
    t.jsonb("chips").notNullable().defaultTo("[]");
    t.jsonb("attachments").notNullable().defaultTo("[]");
    t.text("feedback").nullable();
    t.integer("prompt_tokens").nullable();
    t.integer("completion_tokens").nullable();
    t.integer("total_tokens").nullable();
    t.integer("latency_ms").nullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`CREATE INDEX idx_ai_messages_session ON ai_counselor_messages (session_id, created_at)`);

  await knex.raw(`
    ALTER TABLE ai_counselor_messages
    ADD CONSTRAINT ai_messages_role_check CHECK (role IN ('user', 'assistant'))
  `);
  await knex.raw(`
    ALTER TABLE ai_counselor_messages
    ADD CONSTRAINT ai_messages_feedback_check CHECK (feedback IS NULL OR feedback IN ('positive', 'negative'))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("ai_counselor_messages");
}
