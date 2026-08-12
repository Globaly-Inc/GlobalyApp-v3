import type { Knex } from "knex";

// Earn → My Services. Three tables: a seller's listing, an order against it, and the buyer's review.
//
// Named service_listings, not services: service_categories already exists and is a *business* category
// taxonomy (business_category_default_services), an unrelated thing. A bare "services" table next to it
// would read as its parent.
//
// Money is stored as an integer minor amount (price_minor / amount_minor) and never as numeric or float.
// V2 used numeric and asked the seller to type cents into the form; the units are a storage decision the
// UI never sees.

const CATEGORIES = [
  "airport_pickup",
  "city_orientation",
  "rental_support",
  "employment_support",
  "assignment_help",
  "private_tutoring",
  "other",
];

const CURRENCIES = ["AUD", "USD", "GBP", "EUR"];

const ORDER_STATUSES = [
  "pending_payment",
  "paid",
  "completed",
  "disputed",
  "refunded",
  "cancelled",
];

const list = (values: string[]) => values.map((v) => `'${v}'`).join(", ");

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("service_listings", (t) => {
    t.increments("id").primary();
    t.integer("provider_id").unsigned().notNullable().references("id").inTable("platform_users").onDelete("CASCADE");
    t.text("title").notNullable();
    t.text("description").nullable();
    t.text("category").notNullable();
    t.integer("price_minor").notNullable();          // minor units, e.g. 5000 = $50.00
    t.text("currency").notNullable().defaultTo("AUD");
    // Reuses the existing countries/cities tables. V2 stored both as free text, which is why its listings
    // could not be filtered by location reliably.
    t.integer("country_id").unsigned().nullable().references("id").inTable("countries").onDelete("SET NULL");
    t.integer("city_id").unsigned().nullable().references("id").inTable("cities").onDelete("SET NULL");
    // A storage path, not a URL — signed view URLs are minted per read and expire, same as feed media.
    t.text("cover_storage_path").nullable();
    t.boolean("is_active").notNullable().defaultTo(true);
    t.decimal("avg_rating", 3, 2).notNullable().defaultTo(0);
    t.integer("total_reviews").notNullable().defaultTo(0);
    t.integer("total_orders").notNullable().defaultTo(0);
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
    t.index(["provider_id", "deleted_at"], "service_listings_provider_idx");
    t.index(["is_active", "deleted_at", "created_at"], "service_listings_public_idx");
  });

  await knex.raw(`
    ALTER TABLE service_listings
      ADD CONSTRAINT service_listings_category_chk CHECK (category IN (${list(CATEGORIES)})),
      ADD CONSTRAINT service_listings_currency_chk CHECK (currency IN (${list(CURRENCIES)})),
      ADD CONSTRAINT service_listings_price_chk    CHECK (price_minor > 0),
      ADD CONSTRAINT service_listings_rating_chk   CHECK (avg_rating >= 0 AND avg_rating <= 5)
  `);

  await knex.schema.createTable("service_orders", (t) => {
    t.increments("id").primary();
    // RESTRICT, not CASCADE: an order is a financial record. Listings are soft-deleted and the delete route
    // refuses while orders are open, so this is the backstop for anything that bypasses it.
    t.integer("listing_id").unsigned().notNullable().references("id").inTable("service_listings").onDelete("RESTRICT");
    t.integer("buyer_id").unsigned().notNullable().references("id").inTable("platform_users").onDelete("RESTRICT");
    // Snapshotted from the listing at order time so a later price edit or ownership change cannot
    // retroactively alter what someone owes or who is owed.
    t.integer("provider_id").unsigned().notNullable().references("id").inTable("platform_users").onDelete("RESTRICT");
    t.integer("amount_minor").notNullable();
    t.text("currency").notNullable();
    t.text("status").notNullable().defaultTo("pending_payment");
    t.text("payment_provider").nullable();           // stripe | dev
    t.text("payment_session_id").nullable();
    t.text("payment_intent_id").nullable();          // pi_… — what a refund is issued against
    t.text("payment_refund_id").nullable();          // re_… — a refund without this is unauditable
    t.timestamp("paid_at", { useTz: true }).nullable();
    t.timestamp("completed_at", { useTz: true }).nullable();
    t.timestamp("cancelled_at", { useTz: true }).nullable();
    t.timestamp("refunded_at", { useTz: true }).nullable();
    t.boolean("buyer_confirmed").notNullable().defaultTo(false);
    t.boolean("provider_confirmed").notNullable().defaultTo(false);
    t.text("notes").nullable();
    t.timestamps(true, true);
    t.index(["buyer_id", "created_at"], "service_orders_buyer_idx");
    t.index(["provider_id", "created_at"], "service_orders_provider_idx");
    t.index(["listing_id", "status"], "service_orders_listing_status_idx");
  });

  await knex.raw(`
    ALTER TABLE service_orders
      ADD CONSTRAINT service_orders_status_chk   CHECK (status IN (${list(ORDER_STATUSES)})),
      ADD CONSTRAINT service_orders_currency_chk CHECK (currency IN (${list(CURRENCIES)})),
      ADD CONSTRAINT service_orders_amount_chk   CHECK (amount_minor > 0),
      -- Self-purchase is impossible at the storage layer, not just in a handler.
      ADD CONSTRAINT service_orders_parties_chk   CHECK (buyer_id <> provider_id)
  `);

  // One Stripe session can only ever settle one order. Partial index because most rows have no session
  // until checkout happens, and NULLs would otherwise all be distinct anyway — this states the intent.
  await knex.raw(`
    CREATE UNIQUE INDEX service_orders_session_uniq
      ON service_orders (payment_session_id)
      WHERE payment_session_id IS NOT NULL
  `);

  await knex.schema.createTable("service_reviews", (t) => {
    t.increments("id").primary();
    // Unique: one review per order, enforced by the database rather than by a handler that can be raced.
    t.integer("order_id").unsigned().notNullable().unique().references("id").inTable("service_orders").onDelete("CASCADE");
    t.integer("listing_id").unsigned().notNullable().references("id").inTable("service_listings").onDelete("CASCADE");
    t.integer("reviewer_id").unsigned().notNullable().references("id").inTable("platform_users").onDelete("CASCADE");
    t.integer("rating").notNullable();
    t.text("comment").nullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(["listing_id"], "service_reviews_listing_idx");
  });

  // V2 had no such check — the 1–5 range lived only in a Zod schema, so anything written outside the API
  // could store a 0 or a 97 and skew the listing's average.
  await knex.raw(`
    ALTER TABLE service_reviews
      ADD CONSTRAINT service_reviews_rating_chk CHECK (rating BETWEEN 1 AND 5)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("service_reviews");
  await knex.schema.dropTableIfExists("service_orders");
  await knex.schema.dropTableIfExists("service_listings");
}
