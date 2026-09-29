import type { Knex } from "knex";

// Makes an accepted learning signal recoverable after a broker outage (Greptile P2).
//
// enqueueLearning is deliberately fire-and-forget — a dead broker must never fail the user's
// write — and learning-signals.service.ts already persists the signal on the message row BEFORE
// enqueuing, so the data survives. What was missing is a way to tell a row that was already
// learned from apart from one whose job never reached the queue, which made the surviving signal
// unsweepable. This column is that marker; the message row is the outbox, so no outbox table.
//
// Nullable with no backfill on purpose: every existing row reads "not yet learned", and the
// sweep's own grace window keeps it from stampeding history the first time it runs. A backfill,
// if one is ever wanted, is a script — never this file.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("ai_counselor_messages", (t) => {
    t.timestamp("learned_at", { useTz: true }).nullable();
  });
  // Partial: the sweep only ever asks for unlearned rows carrying a signal, and this table grows
  // with every chat turn — an unqualified index would be mostly rows the sweep never looks at.
  await knex.raw(`
    CREATE INDEX ai_counselor_messages_unlearned_idx
      ON ai_counselor_messages (created_at)
      WHERE learned_at IS NULL AND (feedback IS NOT NULL OR review_status IS NOT NULL)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP INDEX IF EXISTS ai_counselor_messages_unlearned_idx");
  await knex.schema.alterTable("ai_counselor_messages", (t) => t.dropColumn("learned_at"));
}
