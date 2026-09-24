import type { Knex } from "knex";

// The digest sweep groups pending outbox rows by (template, recipient_email) and
// compares the group's oldest created_at against the 5-minute window. The table's
// existing idx_enquiry_email_queue_status covers status alone, which stops being
// selective the moment a burst leaves thousands of rows pending — exactly the case
// this feature exists for. Partial, so the index only ever holds the working set:
// sent rows are the overwhelming majority and are dead weight here.

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE INDEX idx_enquiry_email_queue_pending_group
      ON enquiry_email_queue (template, recipient_email, created_at)
      WHERE status = 'pending'
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP INDEX IF EXISTS idx_enquiry_email_queue_pending_group");
}
