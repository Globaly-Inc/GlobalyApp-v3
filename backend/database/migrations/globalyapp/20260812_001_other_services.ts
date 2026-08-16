import type { Knex } from "knex";

// Earn → My Services — a peer-to-peer marketplace.
//
// Four user-facing tables: a seller's listing, an order (booking request → payment → completion),
// a post-order message thread, and the buyer's review.
//
// The category taxonomy (`other_service_categories`) is admin-managed reference data and lives in
// 20260722_003_other_service_categories alongside the other category tables.
//
// Money is stored as an integer minor amount (price_minor / amount_minor) and never as numeric or float.
// Currency is derived from the listing's country (countries.currency), not stored on the listing itself.
// Orders snapshot the currency at creation time so a country edit cannot retroactively change what was charged.

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TYPE other_service_order_status AS ENUM (
      'requested', 'declined', 'pending_payment', 'paid',
      'in_progress', 'completed', 'disputed', 'refunded', 'cancelled'
    )
  `);

  // ── Listings ──
  await knex.schema.createTable("other_service_listings", (t) => {
    t.increments("id").primary();
    t.integer("provider_id").unsigned().notNullable().references("id").inTable("platform_users").onDelete("CASCADE");
    t.text("title").notNullable();
    t.text("description").nullable();
    t.integer("other_category_id").unsigned().notNullable().references("id").inTable("other_service_categories").onDelete("RESTRICT");
    t.integer("price_minor").notNullable();          // minor units, e.g. 5000 = $50.00
    t.integer("country_id").unsigned().notNullable().references("id").inTable("countries").onDelete("RESTRICT");
    t.integer("city_id").unsigned().nullable().references("id").inTable("cities").onDelete("SET NULL");
    // A storage path, not a URL — signed view URLs are minted per read and expire.
    t.text("cover_storage_path").nullable();
    t.boolean("is_active").notNullable().defaultTo(true);
    t.decimal("avg_rating", 3, 2).notNullable().defaultTo(0);
    t.integer("total_reviews").notNullable().defaultTo(0);
    t.integer("total_orders").notNullable().defaultTo(0);
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
    t.index(["provider_id", "deleted_at"], "other_service_listings_provider_idx");
    t.index(["is_active", "deleted_at", "created_at"], "other_service_listings_public_idx");
    t.index(["other_category_id"], "other_service_listings_category_idx");
  });

  await knex.raw(`
    ALTER TABLE other_service_listings
      ADD CONSTRAINT other_service_listings_price_chk  CHECK (price_minor >= 0),
      ADD CONSTRAINT other_service_listings_rating_chk CHECK (avg_rating >= 0 AND avg_rating <= 5)
  `);

  // ── Orders ──
  await knex.schema.createTable("other_service_orders", (t) => {
    t.increments("id").primary();
    // RESTRICT, not CASCADE: an order is a financial record. Listings are soft-deleted and the delete route
    // refuses while orders are open, so this is the backstop for anything that bypasses it.
    t.integer("listing_id").unsigned().notNullable().references("id").inTable("other_service_listings").onDelete("RESTRICT");
    t.integer("buyer_id").unsigned().notNullable().references("id").inTable("platform_users").onDelete("RESTRICT");
    // Snapshotted from the listing at order time so a later price edit or ownership change cannot
    // retroactively alter what someone owes or who is owed.
    t.integer("provider_id").unsigned().notNullable().references("id").inTable("platform_users").onDelete("RESTRICT");
    t.integer("amount_minor").notNullable();
    t.text("currency").notNullable();                // snapshotted from countries.currency at order time
    t.specificType("status", "other_service_order_status").notNullable().defaultTo("requested");
    t.text("payment_provider").nullable();           // stripe | dev
    t.text("payment_session_id").nullable();
    t.text("payment_intent_id").nullable();          // pi_… — what a refund is issued against
    t.text("payment_refund_id").nullable();          // re_… — a refund without this is unauditable
    // Booking request fields — structured answers keyed by schema_fields `key`, plus free-text note.
    t.jsonb("booking_answers").nullable();
    t.text("booking_note").nullable();
    t.text("decline_reason").nullable();             // why the seller said no
    t.text("notes").nullable();
    t.timestamp("requested_at", { useTz: true }).nullable();
    t.timestamp("accepted_at", { useTz: true }).nullable();
    t.timestamp("declined_at", { useTz: true }).nullable();
    t.timestamp("paid_at", { useTz: true }).nullable();
    t.timestamp("started_at", { useTz: true }).nullable();
    t.timestamp("completed_at", { useTz: true }).nullable();
    t.timestamp("cancelled_at", { useTz: true }).nullable();
    t.timestamp("refunded_at", { useTz: true }).nullable();
    t.boolean("buyer_confirmed").notNullable().defaultTo(false);
    t.boolean("provider_confirmed").notNullable().defaultTo(false);
    t.timestamps(true, true);
    t.index(["buyer_id", "created_at"], "other_service_orders_buyer_idx");
    t.index(["provider_id", "created_at"], "other_service_orders_provider_idx");
    t.index(["listing_id", "status"], "other_service_orders_listing_status_idx");
  });

  await knex.raw(`
    ALTER TABLE other_service_orders
      ADD CONSTRAINT other_service_orders_amount_chk   CHECK (amount_minor > 0),
      ADD CONSTRAINT other_service_orders_parties_chk  CHECK (buyer_id <> provider_id),
      ADD CONSTRAINT other_service_orders_decline_reason_chk CHECK (status <> 'declined' OR decline_reason IS NOT NULL)
  `);

  // One payment session can only ever settle one order.
  await knex.raw(`
    CREATE UNIQUE INDEX other_service_orders_session_uniq
      ON other_service_orders (payment_session_id)
      WHERE payment_session_id IS NOT NULL
  `);

  // The seller's queue: "what is waiting on me".
  await knex.raw(`
    CREATE INDEX other_service_orders_requested_idx
      ON other_service_orders (provider_id, created_at DESC) WHERE status = 'requested'
  `);

  // ── Order messages ──
  await knex.schema.createTable("other_service_order_messages", (t) => {
    t.increments("id").primary();
    t.integer("order_id").unsigned().notNullable().references("id").inTable("other_service_orders").onDelete("CASCADE");
    t.integer("sender_id").unsigned().notNullable().references("id").inTable("platform_users").onDelete("CASCADE");
    t.text("body").notNullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(["order_id", "created_at"], "other_service_order_messages_thread_idx");
  });

  await knex.raw(`
    ALTER TABLE other_service_order_messages
      ADD CONSTRAINT other_service_order_messages_body_chk CHECK (btrim(body) <> '')
  `);

  // ── Reviews ──
  await knex.schema.createTable("other_service_reviews", (t) => {
    t.increments("id").primary();
    // Nullable: reviews are not gated on a purchase. A review with an order_id is a "verified purchase".
    t.integer("order_id").unsigned().nullable().references("id").inTable("other_service_orders").onDelete("CASCADE");
    t.integer("listing_id").unsigned().notNullable().references("id").inTable("other_service_listings").onDelete("CASCADE");
    t.integer("reviewer_id").unsigned().notNullable().references("id").inTable("platform_users").onDelete("CASCADE");
    t.integer("rating").notNullable();
    t.text("comment").nullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(["listing_id"], "other_service_reviews_listing_idx");
  });

  await knex.raw(`
    ALTER TABLE other_service_reviews
      ADD CONSTRAINT other_service_reviews_rating_chk CHECK (rating BETWEEN 1 AND 5)
  `);

  // One review per order (among reviews that have one).
  await knex.raw(`
    CREATE UNIQUE INDEX other_service_reviews_order_uniq
      ON other_service_reviews (order_id) WHERE order_id IS NOT NULL
  `);

  // One voice per person per listing.
  await knex.raw(`
    CREATE UNIQUE INDEX other_service_reviews_listing_reviewer_uniq
      ON other_service_reviews (listing_id, reviewer_id)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("other_service_reviews");
  await knex.schema.dropTableIfExists("other_service_order_messages");
  await knex.schema.dropTableIfExists("other_service_orders");
  await knex.schema.dropTableIfExists("other_service_listings");
  await knex.raw("DROP TYPE IF EXISTS other_service_order_status");
}
