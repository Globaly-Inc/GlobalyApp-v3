import type { Knex } from "knex";

/**
 * Two product changes that travel together.
 *
 * 1. **Reviews are no longer gated on a completed purchase.** Anyone signed in may review a listing.
 *    `order_id` becomes nullable, and its uniqueness becomes partial — one review per order still holds for
 *    the reviews that have one, but a review without an order is no longer blocked by a NULL collision.
 *
 *    The purchase gate was the integrity mechanism, so two cheaper ones replace it:
 *      - `(listing_id, reviewer_id)` unique — one review per person per listing, so nobody can pile on.
 *      - self-review is refused in the service; the database cannot see who owns a listing from this table.
 *    A review with an `order_id` is a *verified purchase* and the UI says so, which is the signal that
 *    survives the gate being removed.
 *
 * 2. **Order messages.** Dual confirmation is gone (see the PRD), so talking to the other party is what
 *    happens after a purchase. Messages are scoped to one order rather than being a general inbox: there is
 *    no messaging module in V3, and an order thread needs no contact list, no presence and no blocking.
 */

export async function up(knex: Knex): Promise<void> {
  // ── 1. Reviews open up ──
  await knex.schema.alterTable("service_reviews", (t) => {
    t.integer("order_id").unsigned().nullable().alter();
  });

  // The unique came from `.unique()` on the column, so knex named it <table>_<column>_unique.
  await knex.raw(`ALTER TABLE service_reviews DROP CONSTRAINT IF EXISTS service_reviews_order_id_unique`);
  await knex.raw(`DROP INDEX IF EXISTS service_reviews_order_id_unique`);

  // Still one review per order — but only among rows that name one. NULLs are free.
  await knex.raw(`
    CREATE UNIQUE INDEX service_reviews_order_uniq
      ON service_reviews (order_id) WHERE order_id IS NOT NULL
  `);

  // One voice per person per listing. This is what stops a single account rating a rival into the ground.
  await knex.raw(`
    CREATE UNIQUE INDEX service_reviews_listing_reviewer_uniq
      ON service_reviews (listing_id, reviewer_id)
  `);

  // ── 2. Order messages ──
  await knex.schema.createTable("service_order_messages", (t) => {
    t.increments("id").primary();
    t.integer("order_id").unsigned().notNullable().references("id").inTable("service_orders").onDelete("CASCADE");
    // Not "buyer_id/provider_id" — who sent it is one column, and the order says which role that is.
    t.integer("sender_id").unsigned().notNullable().references("id").inTable("platform_users").onDelete("CASCADE");
    t.text("body").notNullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    // The thread is always read oldest-first for one order.
    t.index(["order_id", "created_at"], "service_order_messages_thread_idx");
  });

  // An empty or whitespace-only message is not a message.
  await knex.raw(`
    ALTER TABLE service_order_messages
      ADD CONSTRAINT service_order_messages_body_chk CHECK (btrim(body) <> '')
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("service_order_messages");

  await knex.raw(`DROP INDEX IF EXISTS service_reviews_listing_reviewer_uniq`);
  await knex.raw(`DROP INDEX IF EXISTS service_reviews_order_uniq`);

  // Rolling back needs order_id populated again; a review written without a purchase has no order to point
  // at, so those rows go. They could not have existed before this migration.
  await knex("service_reviews").whereNull("order_id").del();
  await knex.schema.alterTable("service_reviews", (t) => {
    t.integer("order_id").unsigned().notNullable().alter();
  });
  await knex.raw(`ALTER TABLE service_reviews ADD CONSTRAINT service_reviews_order_id_unique UNIQUE (order_id)`);
}
