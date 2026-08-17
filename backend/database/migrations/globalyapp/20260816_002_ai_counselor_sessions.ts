import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("ai_counselor_sessions", (t) => {
    t.increments("id").primary();
    t.integer("platform_user_id").unsigned().notNullable().references("id").inTable("platform_users").onDelete("CASCADE");
    t.integer("embed_config_id").unsigned().nullable().references("id").inTable("ai_embed_configs").onDelete("SET NULL");
    t.text("title").nullable();
    t.integer("message_count").notNullable().defaultTo(0);
    t.integer("credits_used").notNullable().defaultTo(0);
    t.boolean("is_archived").notNullable().defaultTo(false);
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
  });

  await knex.raw(`
    CREATE INDEX idx_ai_sessions_user
    ON ai_counselor_sessions (platform_user_id, created_at DESC)
    WHERE deleted_at IS NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("ai_counselor_sessions");
}
