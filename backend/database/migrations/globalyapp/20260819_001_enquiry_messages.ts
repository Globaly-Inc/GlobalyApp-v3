import type { Knex } from "knex";

// The conversation a business gets for unlocking a lead (PRD §3: "a durable
// conversation thread with the student once they've committed").
//
// Keyed on the DISTRIBUTION, not the enquiry: one enquiry fans out to up to 3
// unlockers and each needs its own private thread with the student. Because
// `enquiry_distributions` already IS exactly one (enquiry, business) pair, there is no
// separate conversations table to own the thread — same shape as
// `other_service_order_messages`, where the order itself is the thread.
//
// Lives in globalyapp rather than a tenant schema: both a student and a business read
// these rows, so they cannot belong to one business's schema.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("enquiry_messages", (t) => {
    t.increments("id").primary();
    t.uuid("distribution_id")
      .notNullable()
      .references("id")
      .inTable("enquiry_distributions")
      .onDelete("CASCADE");
    // Both sides are platform users — a business's message is sent by the agent who
    // typed it. Which side that is gets DERIVED at read time by comparing against
    // enquiries.student_id, so a stored role can never drift from reality.
    t.integer("sender_id").unsigned().notNullable().references("id").inTable("platform_users").onDelete("CASCADE");
    t.text("body").notNullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    // Every read is "the whole thread, oldest first".
    t.index(["distribution_id", "created_at"], "enquiry_messages_thread_idx");
  });

  // Whitespace is not a message. Enforced here so it holds regardless of which
  // caller forgets to trim.
  await knex.raw(`
    ALTER TABLE enquiry_messages
      ADD CONSTRAINT enquiry_messages_body_chk CHECK (btrim(body) <> '')
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("enquiry_messages");
}
