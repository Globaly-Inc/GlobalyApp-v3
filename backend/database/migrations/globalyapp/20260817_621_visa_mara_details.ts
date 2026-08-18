// visa_service_details + agent_mara_details — the two promote targets §3.4 lists
// as "exist in V1 but in no V3 migration". Column sets are V2's
// (apps/core-api/src/db/schema/schema.ts) verbatim, transformed to V3 shapes.
//
// ── why both live in master (`public`) ──
//
// agent_mara_details is trivially master: it hangs off an org row, and org rows
// live in master.
//
// visa_service_details is the interesting one. In V2 it was a child of
// `business_services`, which was a single global table. In V3 services live in
// per-tenant schemas, so the V2 placement would put this table in
// migrations/business/ — and then "search every published visa subclass", an
// inherently cross-tenant read, becomes an N-schema fan-out. That is the exact
// problem 20260817_003_catalog_services.ts already solved: it keeps ONE master
// row per tenant service, keyed on the service's (globally unique) uuid, with no
// FK to the tenant row. This table is the same shape and joins straight to it.
//
// The reason it is a plain table and not a second trigger-maintained projection:
// catalog_services needs triggers because three independent writers touch
// business_services and a forgotten sync call is invisible until a service goes
// missing. visa_service_details has exactly ONE writer — the visa promote path
// (superadmin/data-extraction) — so a projection would be two copies of the same
// hundred rows to keep in step for no gain. If tenant-side visa CRUD is ever
// added, that decision has to be revisited: either the writer routes through the
// promote service, or this becomes a projection.
//
// service_id therefore carries an app-level FK (to "<tenant>".business_services.id),
// documented rather than enforced — identical to catalog_services.service_id and
// to the service_id columns in 20260816_003_cross_tenant_tables.ts.
//
// ── the org reference on agent_mara_details ──
// V2 keyed this table on `business_id` (1:1 with `businesses`). V3 cannot: its
// `businesses.owner_id` is NOT NULL, so an unclaimed MARA agency — which is what
// every scraped MARN is until somebody claims it — has no `businesses` row to
// point at. V3's answer to "a directory org nobody owns yet" is `institutions`
// with claim_status='unclaimed' (20260816_001), and the established way to
// address either table is the polymorphic (org_type, org_id) pair from
// 20260816_003. So the 1:1 is on that pair instead of on businesses.id, and a
// claimed agency keeps its MARA record when it becomes a business.

import type { Knex } from "knex";

const ORG_TYPES = ["business", "institution"] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("visa_service_details", (t) => {
    t.increments("id").primary();
    // 1:1 with a tenant service. App-level FK to "<schema>".business_services.id,
    // same precedent as catalog_services.service_id.
    t.uuid("service_id").notNullable().unique();
    // Which tenant schema resolves service_id. Carried for the same reason
    // 20260816_003's cross-tenant rows carry owner_org_*: a bare uuid says
    // nothing about where the row lives.
    t.uuid("schema_name").notNullable();

    t.text("country_code").notNullable();
    t.text("subclass_code").notNullable();
    t.text("visa_stream").nullable();
    t.text("category").nullable();

    t.integer("duration_months").nullable();
    t.boolean("is_permanent").notNullable().defaultTo(false);
    t.jsonb("work_rights").nullable();
    t.jsonb("study_rights").nullable();
    t.boolean("points_test_required").notNullable().defaultTo(false);
    t.integer("min_points").nullable();
    t.jsonb("english_requirements").nullable();
    t.integer("age_min").nullable();
    t.integer("age_max").nullable();
    t.specificType("eligible_nationalities", "text[]").nullable();
    t.specificType("excluded_nationalities", "text[]").nullable();

    t.decimal("application_fee_amount", null).nullable();
    t.text("application_fee_currency").nullable();
    t.integer("processing_time_min_days").nullable();
    t.integer("processing_time_max_days").nullable();

    t.text("official_url").nullable();
    t.text("source_url").nullable();
    t.decimal("confidence_score", null).nullable();
    t.timestamp("last_verified_at").nullable();

    // Idempotency key for the promote path — mirrors business_services
    // .extraction_source_id (business/20260817_001_catalog_extraction_keys.ts).
    t.uuid("extraction_source_id").nullable().unique();

    t.timestamps(true, true);

    t.index(["country_code", "category"], "visa_service_details_country_category_idx");
  });

  // V2's visa_service_details_natural_key, verbatim: one row per
  // (country, subclass, stream). This is what makes re-promoting a staged visa
  // update in place instead of duplicating the subclass.
  await knex.raw(`
    CREATE UNIQUE INDEX visa_service_details_natural_key
      ON visa_service_details (country_code, subclass_code, COALESCE(visa_stream, ''))
  `);

  await knex.schema.createTable("agent_mara_details", (t) => {
    t.increments("id").primary();

    t.text("org_type").notNullable().checkIn([...ORG_TYPES], "agent_mara_details_org_type_check");
    t.integer("org_id").unsigned().notNullable(); // app-level FK to businesses.id | institutions.id

    // V2: unique("agent_mara_details_marn_key"). A MARN identifies exactly one
    // registered migration agent, which is what makes /migration-agents/:marn a
    // valid public address.
    t.text("marn").notNullable().unique();
    t.text("registration_status").nullable();
    t.date("registration_date").nullable();
    t.date("expiry_date").nullable();
    t.text("business_name").nullable();
    t.specificType("practice_areas", "text[]").nullable();
    t.specificType("languages_spoken", "text[]").nullable();
    t.text("office_country").nullable();
    t.text("office_state").nullable();
    t.text("office_city").nullable();
    t.text("source_url").nullable();
    t.timestamp("last_verified_at").nullable();

    t.uuid("extraction_source_id").nullable().unique();

    t.timestamps(true, true);

    // The 1:1 V2 expressed as a business_id primary key.
    t.unique(["org_type", "org_id"], { indexName: "agent_mara_details_org_unique" });
    t.index(["office_state"], "agent_mara_details_office_state_idx");
  });

  // NOTE, deliberately: this table carries no email, phone, office_address or
  // confidence_score, exactly as V2's did. Those columns exist on the staging row
  // (superadmin.extraction_mara_agents) and stay there — the public directory is
  // the only consumer of this table, and contact details are not part of it.
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("agent_mara_details");
  await knex.schema.dropTableIfExists("visa_service_details");
}
