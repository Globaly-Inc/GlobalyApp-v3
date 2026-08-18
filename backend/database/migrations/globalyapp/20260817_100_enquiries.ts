// enquiries + enquiry_distributions — the lead pipeline, shaped from V1
// `public.enquiries` / `public.enquiry_distributions`.
//
// ── why master (`public`) and not a tenant schema ──
// §1.2: anything whose FKs span two businesses lives in master. One enquiry is
// raised by a student and fanned out to N *different* businesses at once, so a
// distribution row is jointly owned by the student's enquiry and one tenant —
// there is no single schema that could hold the set. `enquiries` itself is owned
// by a platform_user, not a business, so it has no candidate tenant schema at
// all. And the distributor has to ask "which businesses are eligible and how
// close are they" in ONE query across every tenant; per-schema tables would turn
// that into an N-schema fan-out. Nothing in this module is business-private —
// a business's whole view of an enquiry is its own `enquiry_distributions` row —
// so nothing is left over to put tenant-side.
//
// The per-business knobs the distributor reads (`enquiry_enabled`,
// `enquiry_coin_cost`, `enquiry_max_distributions`) already exist on
// `public.businesses` (20260804_001), for the same cross-tenant-read reason.
//
// ── divergences from the V1 code, deliberate ──
//  * V1 measured distance institution↔agent. V3 measures student↔business, which
//    is what the V1 PRD specified and what the V3 data supports
//    (platform_user_profiles.latitude/longitude).
//  * V1 priced a distribution at `max(10, round(enquiry_coin_cost * profile
//    completion multiplier))`, but its own UI only let 100%-complete profiles
//    raise an enquiry, so the multiplier was always 1.0 (all 3 V1 rows: cost 30).
//    V3 carries the floor and drops the dead multiplier.
//  * V1 hard-coded the fan-out cap at 5 and never read
//    `businesses.enquiry_max_distributions`. V3 reads it.
//  * The unlock flags V1 kept on the distribution row (`is_unlocked`,
//    `unlocked_at`, `unlocked_by`) move to `enquiry_unlocks` (20260817_101), so
//    "is this paid for" has exactly one writer and one row.

import type { Knex } from "knex";

// V1 `enquiry_status` enum, verbatim (6 values). Both tables shared it in V1.
const ENQUIRY_STATUSES = [
  "pending",
  "viewed",
  "responded",
  "assigned",
  "converted",
  "closed",
] as const;

// Distributions only ever reached these four in V1.
const DISTRIBUTION_STATUSES = ["pending", "viewed", "responded", "closed"] as const;

const ORG_TYPES = ["business", "institution"] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("enquiries", (t) => {
    t.increments("id").primary();
    // V1 ids are uuids; carried so a Stage-2 load can re-run idempotently.
    t.uuid("v1_id").nullable().unique();

    t.integer("student_id").unsigned().notNullable()
      .references("id").inTable("platform_users").onDelete("CASCADE");

    // The org the enquiry is *about*. Polymorphic for the same reason
    // 20260816_003 is: V3 splits V1's `businesses` into owner-backed
    // `businesses` and unclaimed `institutions`. App-level FK.
    t.text("target_org_type").nullable();
    t.integer("target_org_id").unsigned().nullable();

    // V1 enquiries.service_id — a uuid inside the target org's tenant schema.
    t.uuid("service_id").nullable();

    // V1 enquiries.agent_id — an agent addressed directly by the student. Only a
    // business can be one (an institution has no wallet and no tenant schema).
    t.integer("agent_business_id").unsigned().nullable()
      .references("id").inTable("businesses").onDelete("SET NULL");

    t.text("message").notNullable();
    t.text("preferred_intake").nullable();
    t.integer("preferred_year").nullable();

    t.text("status").notNullable().defaultTo("pending")
      .checkIn([...ENQUIRY_STATUSES], "enquiries_status_check");

    t.integer("assigned_to").unsigned().nullable()
      .references("id").inTable("platform_users").onDelete("SET NULL");
    t.timestamp("distributed_at").nullable();
    t.timestamp("converted_at").nullable();

    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();

    t.index(["student_id", "created_at"], "enquiries_student_created_idx");
    t.index(["status"], "enquiries_status_idx");

    // Both halves of the org reference, or neither.
    t.check(
      "(target_org_type IS NULL AND target_org_id IS NULL)" +
        " OR (target_org_type IS NOT NULL AND target_org_id IS NOT NULL)",
      [],
      "enquiries_target_org_pair_check",
    );
    t.check(
      `target_org_type IS NULL OR target_org_type IN ('${ORG_TYPES.join("','")}')`,
      [],
      "enquiries_target_org_type_check",
    );
  });

  await knex.schema.createTable("enquiry_distributions", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();

    t.integer("enquiry_id").unsigned().notNullable()
      .references("id").inTable("enquiries").onDelete("CASCADE");
    // V1 called this `agent_id`. Recipients are always businesses: only a
    // business has a credit wallet to pay the unlock from.
    t.integer("business_id").unsigned().notNullable()
      .references("id").inTable("businesses").onDelete("CASCADE");

    // Price snapshot, taken when the lead was distributed. The unlock charges
    // THIS, never today's `businesses.enquiry_coin_cost` — a business must not be
    // able to change what an already-offered lead costs.
    t.integer("coin_cost").notNullable();
    // Student→business great-circle distance at distribution time, km. Null when
    // either side had no coordinates (the business was picked by fallback).
    t.decimal("distance_km", 8, 2).nullable();

    t.text("status").notNullable().defaultTo("pending")
      .checkIn([...DISTRIBUTION_STATUSES], "enquiry_distributions_status_check");

    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();

    // V1's real double-distribution guard, kept: re-running distribution is a
    // no-op rather than a second charge-able copy of the same lead.
    t.unique(["enquiry_id", "business_id"], { indexName: "enquiry_distributions_pair_unique" });
    t.index(["business_id", "created_at"], "enquiry_distributions_business_created_idx");
    t.check("coin_cost >= 0", [], "enquiry_distributions_coin_cost_check");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("enquiry_distributions");
  await knex.schema.dropTableIfExists("enquiries");
}
