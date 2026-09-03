import type { Knex } from "knex";

// A personal bookmark on one message — GlobalyOS V2's `chat_message_stars`, which
// is per-MESSAGE and per-viewer (unlike Favorites, which is per-conversation).
// Separate table from enquiry_thread_states for exactly that reason: different
// grain, so it cannot share a primary key with it.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("enquiry_message_stars", (t) => {
    t.integer("message_id").unsigned().notNullable().references("id").inTable("enquiry_messages").onDelete("CASCADE");
    t.integer("user_id").unsigned().notNullable().references("id").inTable("platform_users").onDelete("CASCADE");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.primary(["message_id", "user_id"]);
  });

  // The Starred view is "all of this user's stars, newest first".
  await knex.raw("CREATE INDEX idx_enquiry_message_stars_user ON enquiry_message_stars (user_id, created_at DESC)");
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("enquiry_message_stars");
}
