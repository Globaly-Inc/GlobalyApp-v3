import type { Knex } from "knex";

// Per-viewer state on an enquiry chat thread: how far they have read, and whether
// they pinned it to Favorites. GlobalyOS V2 keeps these in two separate tables
// (chat_read_receipts + chat_favorites); here one row per (thread, user) carries
// both, because both are exactly "this person's private view of this thread" and a
// second table would only ever be joined alongside the first.
//
// Keyed on distribution_id like enquiry_messages — the distribution IS the thread.
// user_id, not student_id: the business agent on the other side reads the same
// thread, so this table already fits them if the business UI wants it later.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("enquiry_thread_states", (t) => {
    t.uuid("distribution_id")
      .notNullable()
      .references("id")
      .inTable("enquiry_distributions")
      .onDelete("CASCADE");
    t.integer("user_id").unsigned().notNullable().references("id").inTable("platform_users").onDelete("CASCADE");
    // Null means "never opened" — every message counts as unread, which is what a
    // freshly unlocked thread should look like.
    t.timestamp("last_read_at", { useTz: true }).nullable();
    // Timestamp rather than a boolean: Favorites is an ordered list in V2 and the
    // order it was pinned is the only ordering signal we store.
    t.timestamp("favorited_at", { useTz: true }).nullable();

    t.primary(["distribution_id", "user_id"]);
  });

  // The sidebar reads "every thread state for this user" on each inbox load.
  await knex.raw("CREATE INDEX idx_enquiry_thread_states_user ON enquiry_thread_states (user_id)");
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("enquiry_thread_states");
}
