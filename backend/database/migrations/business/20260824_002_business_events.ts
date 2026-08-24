import type { Knex } from "knex";

// Business Events — core management only (no Stripe/payment integration).
// Tickets are a configurable field set (name/price/capacity) recorded on a
// registration for bookkeeping; no charge is ever processed. RSVP/sold counts
// are maintained by the service layer inside the same transaction as the
// registration insert/delete (ponytail: no DB triggers, see events.service.ts).

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("business_events", (t) => {
    t.increments("id").primary();
    t.integer("created_by").unsigned().nullable().references("id").inTable("agents");
    t.text("title").notNullable();
    t.text("slug").notNullable();
    t.text("description").nullable();
    t.text("event_type").notNullable().defaultTo("in_person");
    t.text("status").notNullable().defaultTo("draft");
    t.text("visibility").notNullable().defaultTo("public");
    t.jsonb("target_audiences").notNullable().defaultTo("[]");
    t.text("venue_name").nullable();
    t.text("venue_address").nullable();
    t.text("venue_city").nullable();
    t.text("venue_country").nullable();
    t.text("online_url").nullable();
    t.text("online_platform").nullable();
    t.timestamp("starts_at", { useTz: true }).notNullable();
    t.timestamp("ends_at", { useTz: true }).notNullable();
    t.text("timezone").nullable();
    t.integer("max_capacity").nullable();
    t.timestamp("registration_deadline", { useTz: true }).nullable();
    t.text("contact_email").nullable();
    t.text("contact_phone").nullable();
    t.integer("rsvp_count").notNullable().defaultTo(0);
    t.timestamp("published_at", { useTz: true }).nullable();
    t.timestamp("cancelled_at", { useTz: true }).nullable();
    t.text("cancellation_reason").nullable();
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
    t.unique(["slug"]);
    t.index(["status"]);
    t.index(["starts_at"]);
  });

  await knex.raw(`
    ALTER TABLE business_events
      ADD CONSTRAINT chk_business_events_status
      CHECK (status IN ('draft','published','cancelled','completed'))
  `);
  await knex.raw(`
    ALTER TABLE business_events
      ADD CONSTRAINT chk_business_events_visibility
      CHECK (visibility IN ('public','members','invite_only'))
  `);
  await knex.raw(`
    ALTER TABLE business_events
      ADD CONSTRAINT chk_business_events_event_type
      CHECK (event_type IN ('in_person','online','hybrid'))
  `);
  await knex.raw(`
    ALTER TABLE business_events
      ADD CONSTRAINT chk_business_events_dates
      CHECK (ends_at >= starts_at)
  `);

  // Tickets — no Stripe fields. price/currency are display-only bookkeeping.
  await knex.schema.createTable("business_event_tickets", (t) => {
    t.increments("id").primary();
    t.integer("event_id").unsigned().notNullable().references("id").inTable("business_events").onDelete("CASCADE");
    t.text("name").notNullable();
    t.text("description").nullable();
    t.decimal("price", 10, 2).notNullable().defaultTo(0);
    t.text("currency").notNullable().defaultTo("USD");
    t.integer("quantity").nullable(); // null = unlimited
    t.integer("sold_count").notNullable().defaultTo(0);
    t.integer("max_per_order").notNullable().defaultTo(10);
    t.boolean("is_active").notNullable().defaultTo(true);
    t.integer("sort_order").notNullable().defaultTo(0);
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
    t.index(["event_id"]);
  });

  // Registrations — free RSVPs. ticket_id is recorded for bookkeeping only
  // (no payment processing in this scope). Registrant identity is captured
  // directly (name/email/phone) rather than a platform_users FK: this is a
  // business-staff-managed guest list for core management, not a public
  // self-serve signup flow.
  await knex.schema.createTable("business_event_registrations", (t) => {
    t.increments("id").primary();
    t.integer("event_id").unsigned().notNullable().references("id").inTable("business_events").onDelete("CASCADE");
    t.integer("ticket_id").unsigned().nullable().references("id").inTable("business_event_tickets").onDelete("SET NULL");
    t.text("registrant_name").notNullable();
    t.text("registrant_email").notNullable();
    t.text("registrant_phone").nullable();
    t.text("status").notNullable().defaultTo("registered");
    t.integer("quantity").notNullable().defaultTo(1);
    t.text("notes").nullable();
    t.timestamp("checked_in_at", { useTz: true }).nullable();
    t.timestamp("cancelled_at", { useTz: true }).nullable();
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
    t.index(["event_id"]);
    t.index(["ticket_id"]);
  });

  await knex.raw(`
    ALTER TABLE business_event_registrations
      ADD CONSTRAINT chk_business_event_registrations_status
      CHECK (status IN ('registered','checked_in','cancelled'))
  `);

  // Co-hosts — cross-schema target (another business in master.businesses), no
  // real FK possible; name/logo are a display snapshot taken at invite time.
  await knex.schema.createTable("business_event_co_hosts", (t) => {
    t.increments("id").primary();
    t.integer("event_id").unsigned().notNullable().references("id").inTable("business_events").onDelete("CASCADE");
    t.integer("host_business_id").notNullable();
    t.text("host_business_name").notNullable();
    t.integer("invited_by").unsigned().nullable().references("id").inTable("agents");
    t.text("status").notNullable().defaultTo("pending");
    t.text("role").notNullable().defaultTo("co_host");
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
    t.unique(["event_id", "host_business_id"]);
  });

  await knex.raw(`
    ALTER TABLE business_event_co_hosts
      ADD CONSTRAINT chk_business_event_co_hosts_status
      CHECK (status IN ('pending','accepted','declined'))
  `);

  await knex.schema.createTable("business_event_updates", (t) => {
    t.increments("id").primary();
    t.integer("event_id").unsigned().notNullable().references("id").inTable("business_events").onDelete("CASCADE");
    t.integer("author_id").unsigned().nullable().references("id").inTable("agents");
    t.text("title").nullable();
    t.text("content").notNullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(["event_id"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("business_event_updates");
  await knex.schema.dropTableIfExists("business_event_co_hosts");
  await knex.schema.dropTableIfExists("business_event_registrations");
  await knex.schema.dropTableIfExists("business_event_tickets");
  await knex.schema.dropTableIfExists("business_events");
}
