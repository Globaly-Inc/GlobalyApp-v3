// enquiry_email_queue — what the digest worker drains. Shaped from V1
// `public.enquiry_email_queue`, master for the same reason as its parent.
//
// Differences from V1:
//  * `queued_at` is gone. It is 100% NULL across every V1 row and no code path
//    ever wrote it; `created_at` already carries that fact.
//  * `status` gains 'failed'. V1 flipped rows to 'sent' even when Resend
//    rejected them, so a bounced digest looked delivered.
//  * UNIQUE(distribution_id): one digest entry per distributed lead. Combined
//    with the worker's `WHERE status = 'pending' ... RETURNING` claim, a
//    re-delivered queue message can neither duplicate a row nor re-send one.

import type { Knex } from "knex";

const QUEUE_STATUSES = ["pending", "sent", "failed"] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("enquiry_email_queue", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();

    t.integer("distribution_id").unsigned().notNullable().unique()
      .references("id").inTable("enquiry_distributions").onDelete("CASCADE");
    t.integer("business_id").unsigned().notNullable()
      .references("id").inTable("businesses").onDelete("CASCADE");

    t.text("status").notNullable().defaultTo("pending")
      .checkIn([...QUEUE_STATUSES], "enquiry_email_queue_status_check");
    t.timestamp("sent_at").nullable();
    t.integer("attempts").notNullable().defaultTo(0);
    t.text("last_error").nullable();

    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
  });

  // The worker's only hot query: oldest pending rows, grouped per business.
  await knex.raw(
    `CREATE INDEX enquiry_email_queue_pending_idx
       ON enquiry_email_queue (business_id, created_at)
     WHERE status = 'pending' AND deleted_at IS NULL`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("enquiry_email_queue");
}
