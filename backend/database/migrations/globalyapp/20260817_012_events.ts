// Events + ticketing + registrations — MASTER schema, not tenant.
//
// PLACEMENT (§1.2 "anything with FKs across two businesses lives in master"):
// an event is *hosted* by one org but *registered for* by platform users from
// anywhere, and *co-hosted* by other orgs. event_registrations FKs
// platform_users; event_co_hosts is a literal org↔org edge. Neither fits inside
// one tenant schema, and admin/monitoring/events plus the public event browse
// both need one query rather than a fan-out over every schema.
//
// The host is a polymorphic (org_type, org_id) pair, the same precedent as
// 20260816_003_cross_tenant_tables.ts: V3 splits V1's single `businesses` table
// into `businesses` (owner-backed, has a tenant schema) and `institutions`
// (unclaimed directory listings). 7 of V1's 8 event hosts are unclaimed, so a
// plain FK to `businesses` would drop 7 of the 8 events on import.
//
// OVERSELL: event_tickets.claimed_count is the ledger and the DB owns the
// invariant — CHECK (quantity IS NULL OR claimed_count <= quantity). Every seat
// movement is a single conditional UPDATE, so concurrency is resolved by the row
// lock, not by application code. "claimed" means reserved-or-paid: a paid
// checkout claims its seats BEFORE Stripe is called, which is the race V1's
// verify-event-payment left open (it only bumped sold_count at settlement, so
// two buyers could both check out and both pay).

import type { Knex } from "knex";

const ORG_TYPES = ["business", "institution"] as const;

/** (type, id) pair addressing either businesses.id or institutions.id. App-level FK. */
function orgRef(t: Knex.CreateTableBuilder, prefix: string): void {
  t.text(`${prefix}_org_type`)
    .notNullable()
    .checkIn([...ORG_TYPES], `${prefix}_org_type_check`);
  t.integer(`${prefix}_org_id`).unsigned().notNullable(); // app-level FK to businesses.id | institutions.id
}

export async function up(knex: Knex): Promise<void> {
  // ── events (V1: 8) ──
  await knex.schema.createTable("events", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();
    orgRef(t, "host");
    t.integer("created_by").unsigned().nullable().references("id").inTable("platform_users").onDelete("SET NULL");

    t.text("title").notNullable();
    t.text("slug").notNullable().unique();
    t.text("description").nullable();
    t.text("summary").nullable();
    t.text("cover_image_url").nullable();

    t.text("event_type").notNullable().defaultTo("in_person")
      .checkIn(["in_person", "online", "hybrid"], "events_event_type_check");
    // Exactly V1's five categories — nothing invented.
    t.text("category").nullable()
      .checkIn(["networking", "workshop", "conference", "open_day", "other"], "events_category_check");
    t.text("status").notNullable().defaultTo("draft")
      .checkIn(["draft", "published", "cancelled"], "events_status_check");
    t.text("visibility").notNullable().defaultTo("public")
      .checkIn(["public", "targeted"], "events_visibility_check");

    t.specificType("target_audiences", "text[]").nullable();
    t.specificType("target_countries", "text[]").nullable();

    t.text("venue_name").nullable();
    t.text("venue_address").nullable();
    t.text("venue_city").nullable();
    t.text("venue_country").nullable();
    t.double("venue_latitude").nullable();
    t.double("venue_longitude").nullable();
    t.text("online_url").nullable();
    t.text("online_platform").nullable();

    t.timestamp("starts_at", { useTz: true }).notNullable();
    t.timestamp("ends_at", { useTz: true }).notNullable();
    t.text("timezone").nullable();
    t.integer("max_capacity").nullable();
    t.timestamp("registration_deadline", { useTz: true }).nullable();

    t.boolean("is_featured").notNullable().defaultTo(false);
    t.specificType("tags", "text[]").nullable();
    t.text("contact_email").nullable();
    t.text("contact_phone").nullable();
    // rsvp_count is NOT carried: V1 kept a denormalised counter that nothing
    // maintained transactionally. Registrations are counted from the ledger.
    t.integer("views_count").notNullable().defaultTo(0);

    t.timestamp("published_at", { useTz: true }).nullable();
    t.timestamp("cancelled_at", { useTz: true }).nullable();
    t.text("cancellation_reason").nullable();
    t.jsonb("settings").notNullable().defaultTo("{}");

    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();

    t.index(["host_org_type", "host_org_id"], "events_host_idx");
    t.index(["status", "visibility", "starts_at"], "events_browse_idx");
    t.check("ends_at >= starts_at", [], "events_end_after_start_check");
  });

  // ── event_tickets (V1: 6) ──
  await knex.schema.createTable("event_tickets", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();
    t.integer("event_id").unsigned().notNullable().references("id").inTable("events").onDelete("CASCADE");
    t.text("name").notNullable();
    t.text("description").nullable();
    t.decimal("price", 12, 2).notNullable().defaultTo(0);
    t.text("currency").notNullable().defaultTo("USD");
    /** Seat capacity. NULL = unlimited (V1's semantics). */
    t.integer("quantity").nullable();
    /**
     * The ledger. V1 called this sold_count and only moved it at settlement;
     * here it counts reserved-or-paid seats and moves at checkout, which is what
     * makes overselling impossible rather than merely unlikely.
     */
    t.integer("claimed_count").notNullable().defaultTo(0);
    t.integer("max_per_order").notNullable().defaultTo(10);
    t.timestamp("sale_starts_at", { useTz: true }).nullable();
    t.timestamp("sale_ends_at", { useTz: true }).nullable();
    t.boolean("is_active").notNullable().defaultTo(true);
    t.integer("sort_order").notNullable().defaultTo(0);
    t.text("stripe_price_id").nullable();
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();

    t.index(["event_id"], "event_tickets_event_idx");
    t.check("price >= 0", [], "event_tickets_price_check");
    t.check("claimed_count >= 0", [], "event_tickets_claimed_non_negative_check");
    // The oversell invariant. Nothing in the application can violate it, ever.
    t.check("quantity IS NULL OR claimed_count <= quantity", [], "event_tickets_no_oversell_check");
  });

  // ── event_registrations (V1: 4) ──
  await knex.schema.createTable("event_registrations", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();
    t.integer("event_id").unsigned().notNullable().references("id").inTable("events").onDelete("CASCADE");
    t.integer("ticket_id").unsigned().nullable().references("id").inTable("event_tickets").onDelete("SET NULL");
    t.integer("platform_user_id").unsigned().notNullable()
      .references("id").inTable("platform_users").onDelete("CASCADE");

    t.text("status").notNullable().defaultTo("registered")
      .checkIn(["registered", "checked_in", "cancelled"], "event_registrations_status_check");
    t.integer("quantity").notNullable().defaultTo(1);
    t.decimal("total_paid", 12, 2).notNullable().defaultTo(0);
    t.text("payment_status").notNullable().defaultTo("free")
      .checkIn(["free", "pending", "paid", "refunded", "expired"], "event_registrations_payment_status_check");
    /** Set at checkout. UNIQUE so a webhook replay can only ever find one row. */
    t.text("stripe_session_id").nullable().unique();
    /** Pending checkouts hold seats until this instant; expiry is reaped lazily. */
    t.timestamp("hold_expires_at", { useTz: true }).nullable();

    t.timestamp("check_in_at", { useTz: true }).nullable();
    t.timestamp("cancelled_at", { useTz: true }).nullable();
    t.text("notes").nullable();
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();

    t.index(["event_id", "status"], "event_registrations_event_idx");
    t.index(["platform_user_id"], "event_registrations_user_idx");
    t.check("quantity >= 1", [], "event_registrations_quantity_check");
  });

  // NULLS NOT DISTINCT so a plain RSVP (ticket_id IS NULL) dedupes too. V1's
  // plain UNIQUE let one user RSVP the same event any number of times, because
  // Postgres treats each NULL as distinct.
  await knex.raw(
    "CREATE UNIQUE INDEX event_registrations_unique_per_user " +
      "ON event_registrations (event_id, platform_user_id, ticket_id) NULLS NOT DISTINCT",
  );

  // ── event_co_hosts (V1: 0 rows, but the org↔org edge is *why* events sit in master) ──
  await knex.schema.createTable("event_co_hosts", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();
    t.integer("event_id").unsigned().notNullable().references("id").inTable("events").onDelete("CASCADE");
    orgRef(t, "co_host");
    t.integer("invited_by").unsigned().nullable().references("id").inTable("platform_users").onDelete("SET NULL");
    t.text("status").notNullable().defaultTo("pending")
      .checkIn(["pending", "accepted", "declined"], "event_co_hosts_status_check");
    t.text("role").notNullable().defaultTo("co_host");
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
    t.unique(["event_id", "co_host_org_type", "co_host_org_id"], { indexName: "event_co_hosts_unique" });
  });

  // ── event_updates (V1: 2) ──
  await knex.schema.createTable("event_updates", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();
    t.integer("event_id").unsigned().notNullable().references("id").inTable("events").onDelete("CASCADE");
    t.integer("author_id").unsigned().nullable().references("id").inTable("platform_users").onDelete("SET NULL");
    t.text("title").nullable();
    t.text("content").notNullable();
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
    t.index(["event_id"], "event_updates_event_idx");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("event_updates");
  await knex.schema.dropTableIfExists("event_co_hosts");
  await knex.schema.dropTableIfExists("event_registrations");
  await knex.schema.dropTableIfExists("event_tickets");
  await knex.schema.dropTableIfExists("events");
}
