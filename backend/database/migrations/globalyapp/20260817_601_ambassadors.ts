// The ambassador roster. Wave G4.
//
// Spec: V2 `ambassadors` (routes/ambassador.ts's column map is the field list)
// plus V1's `create-ambassador-connect` / `ambassador-connect-onboarding`
// (stripe_account_id, stripe_onboarding_complete) and `send-ambassador-digest`
// (total_resolved, avg_rating, joined_at).
//
// MONEY IS INTEGER MINOR UNITS, never numeric — the same rule 20260812_001
// (other_services) set for this database. V1 stored dollars in `numeric` and
// then did `Number(available_earnings) - amount` in JavaScript; that arithmetic
// is exactly what the `_minor` columns exist to prevent.
//
// The three balance columns are a CACHE of `ambassador_earnings`, not the
// ledger. 20260817_603 is the ledger. They are maintained inside the same
// transaction as the ledger rows and carry non-negative check constraints so a
// bug that would overdraw an ambassador aborts the transaction instead of
// silently writing a negative balance.

import type { Knex } from "knex";

const AMBASSADOR_STATUSES = ["pending", "active", "inactive", "suspended"] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("ambassadors", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();

    t.integer("user_id").unsigned().notNullable()
      .references("id").inTable("platform_users").onDelete("CASCADE");
    t.integer("program_id").unsigned().notNullable()
      .references("id").inTable("ambassador_programs").onDelete("CASCADE");

    t.text("status").notNullable().defaultTo("active")
      .checkIn([...AMBASSADOR_STATUSES], "ambassadors_status_check");
    t.text("deactivation_reason").nullable();

    // Public profile fields (exposed by the anonymous read).
    t.text("bio").nullable();
    t.text("photo_url").nullable();
    t.text("major").nullable();
    t.integer("year").nullable();
    t.text("country_of_origin").nullable();
    t.specificType("languages", "text[]").notNullable().defaultTo("{}");
    t.specificType("interests", "text[]").notNullable().defaultTo("{}");

    // Engagement counters (denormalised, maintained by the engagement service).
    t.decimal("avg_rating", 3, 2).notNullable().defaultTo(0);
    t.integer("total_inquiries").notNullable().defaultTo(0);
    t.integer("total_resolved").notNullable().defaultTo(0);
    t.integer("typical_response_time_minutes").nullable();
    t.boolean("is_online").notNullable().defaultTo(false);
    t.timestamp("last_active_at").nullable();
    t.timestamp("joined_at").notNullable().defaultTo(knex.fn.now());

    // Money cache — see the header. ADMIN-ONLY: never in a public projection.
    t.integer("total_earnings_minor").notNullable().defaultTo(0);
    t.integer("pending_earnings_minor").notNullable().defaultTo(0);
    t.integer("available_earnings_minor").notNullable().defaultTo(0);
    t.text("currency", 3).notNullable().defaultTo("AUD");

    // Stripe Connect. ADMIN-ONLY, same as the balances.
    t.text("stripe_account_id").nullable().unique();
    t.boolean("stripe_onboarding_complete").notNullable().defaultTo(false);

    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();

    // One ambassadorship per user per program — V2's accept-application promotion
    // is idempotent because of this.
    t.unique(["user_id", "program_id"], { indexName: "ambassadors_user_program_uniq" });
    t.index(["program_id", "status"], "ambassadors_program_status_idx");

    t.check("total_earnings_minor >= 0", [], "ambassadors_total_earnings_check");
    t.check("pending_earnings_minor >= 0", [], "ambassadors_pending_earnings_check");
    t.check("available_earnings_minor >= 0", [], "ambassadors_available_earnings_check");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("ambassadors");
}
