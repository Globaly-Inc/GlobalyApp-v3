import type { Knex } from "knex";

/**
 * Booking requests: the buyer asks, the seller answers, and only then is there anything to pay for.
 *
 * Before this, pressing Buy created an order in `pending_payment` and the buyer could pay immediately — which
 * assumes the seller is free. They are not: an airport pickup at 6am on Tuesday is a commitment against one
 * person's calendar. So an order now starts as `requested`, carrying whatever the category asks for, and the
 * seller either accepts it (making it payable) or declines it with a reason.
 *
 * Three statuses join the six already there:
 *   requested   — waiting on the seller. The new starting point.
 *   declined    — the seller said no. Terminal, and must carry a reason.
 *   in_progress — the seller has started the work. Between `paid` and `completed`.
 *
 * `completed` comes back into use here. It was orphaned when dual confirmation was removed (20260814_001):
 * the value stayed in the enum for historical rows but nothing produced it. It is now the seller's own
 * declaration that the work is done, which is a different and much simpler claim than "both parties agree".
 *
 * The answers are `jsonb` rather than columns because the questions differ per category and are themselves
 * data — an admin defines them in `schema_fields` against the category, so a column per question would mean a
 * migration every time someone adds one.
 */

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("other_service_orders", (t) => {
    // What the buyer answered, keyed by the schema_fields `key` for the listing's category.
    t.jsonb("booking_answers").nullable();
    // Free text alongside the structured answers — "I'll have two suitcases".
    t.text("booking_note").nullable();
    // Why the seller said no. Shown to the buyer; a refusal they cannot act on is a dead end.
    t.text("decline_reason").nullable();
    t.timestamp("requested_at", { useTz: true }).nullable();
    t.timestamp("accepted_at", { useTz: true }).nullable();
    t.timestamp("declined_at", { useTz: true }).nullable();
    t.timestamp("started_at", { useTz: true }).nullable();
  });

  // Replace rather than add: a status is one value, so two CHECKs would both have to pass.
  await knex.raw(`ALTER TABLE other_service_orders DROP CONSTRAINT IF EXISTS service_orders_status_chk`);
  await knex.raw(`
    ALTER TABLE other_service_orders
      ADD CONSTRAINT service_orders_status_chk
      CHECK (status IN (
        'requested', 'declined', 'pending_payment', 'paid',
        'in_progress', 'completed', 'disputed', 'refunded', 'cancelled'
      ))
  `);

  // The reason is not optional. Enforced here as well as in the schema and the service, so nothing that
  // bypasses the API can leave a buyer with an unexplained refusal.
  await knex.raw(`
    ALTER TABLE other_service_orders
      ADD CONSTRAINT service_orders_decline_reason_chk
      CHECK (status <> 'declined' OR decline_reason IS NOT NULL)
  `);

  // The seller's queue: "what is waiting on me". Small, frequently read, and read by provider.
  await knex.raw(`
    CREATE INDEX other_service_orders_requested_idx
      ON other_service_orders (provider_id, created_at DESC) WHERE status = 'requested'
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS other_service_orders_requested_idx`);
  await knex.raw(`ALTER TABLE other_service_orders DROP CONSTRAINT IF EXISTS service_orders_decline_reason_chk`);

  // Rolling back means the three new statuses cannot exist. Nothing sensible maps a declined booking onto the
  // old set, so those rows go; requested and in_progress fall back to the nearest older meaning.
  await knex("other_service_orders").where({ status: "declined" }).del();
  await knex("other_service_orders").where({ status: "requested" }).update({ status: "pending_payment" });
  await knex("other_service_orders").where({ status: "in_progress" }).update({ status: "paid" });

  await knex.raw(`ALTER TABLE other_service_orders DROP CONSTRAINT IF EXISTS service_orders_status_chk`);
  await knex.raw(`
    ALTER TABLE other_service_orders
      ADD CONSTRAINT service_orders_status_chk
      CHECK (status IN ('pending_payment', 'paid', 'completed', 'disputed', 'refunded', 'cancelled'))
  `);

  await knex.schema.alterTable("other_service_orders", (t) => {
    t.dropColumn("booking_answers");
    t.dropColumn("booking_note");
    t.dropColumn("decline_reason");
    t.dropColumn("requested_at");
    t.dropColumn("accepted_at");
    t.dropColumn("declined_at");
    t.dropColumn("started_at");
  });
}
