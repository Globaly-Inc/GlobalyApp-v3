// Ad engagement: impressions, leads, dismissals, reports (Wave G5).
//
// Schema spec: V2 `ad_impressions` / `ad_leads` / `ad_dismissed` / `ad_reports`.
// Master (`public`) for the same reason as ad_campaigns — every row here FKs a
// platform user, which no tenant schema may reference. See 20260817_800.
//
// ── WHY THERE IS STILL ONE ROW PER IMPRESSION ──
// The brief asked whether impressions can be aggregated instead of appended.
// V2's contract says no: GET /me/business/ads/campaigns/:id/analytics returns the
// RAW impression rows (id, creative_id, placement, is_click, viewed_at) because
// the campaign editor slices them client-side per creative and per placement.
// Collapsing them into counters would delete the per-creative breakdown that is
// the whole point of the analytics screen.
// What makes that affordable is the dedup below: at most ONE row per
// (campaign, placement, viewer, hour), so the row count is bounded by distinct
// viewers, not by page views. The unbounded part of V1's design — a full
// count(*) over the campaign's impressions on every request — is what moved onto
// ad_campaigns.impressions_count as an atomic increment (20260817_800).
//
// ── DEDUP IS A CONSTRAINT, NOT A CHECK (defect D-G5-2) ──
// V1/V2 dedup by `SELECT count(*) ... WHERE viewed_at >= now() - 1 hour` and then
// INSERT. That is a read-then-write race: N concurrent impressions from the same
// viewer all see 0 and all insert, and on a CPV campaign all N charge the
// advertiser — precisely the budget-drain abuse the auth check was added to stop.
// V3 keeps the rolling-hour pre-check for parity (it is what produces
// `deduplicated: true` in the ordinary sequential case) but the ARBITER is
// `ad_impressions_dedup_uniq` on (campaign_id, placement, viewer_user_id,
// viewed_hour), a STORED generated column truncating viewed_at to the UTC hour.
// The trade: a fixed hour bucket instead of a rolling window, so a viewer at
// 10:59 and again at 11:00 counts twice. That is strictly safer than V1, whose
// concurrent bound was unbounded.
//
// `date_trunc('hour', viewed_at AT TIME ZONE 'UTC')` is immutable (timezone(text,
// timestamptz) and date_trunc(text, timestamp) both are), which is what lets it
// be a STORED generated column.

import type { Knex } from "knex";

const LEAD_TYPES = ["click", "enquiry", "rsvp"] as const;
const REPORT_REASONS = ["inappropriate", "misleading", "spam", "offensive", "other"] as const;
const REPORT_STATUSES = ["pending", "reviewed", "dismissed", "actioned"] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("ad_impressions", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();

    t.integer("campaign_id").unsigned().notNullable()
      .references("id").inTable("ad_campaigns").onDelete("CASCADE");
    t.integer("creative_id").unsigned().nullable()
      .references("id").inTable("ad_creatives").onDelete("SET NULL");

    // NOT NULL, unlike V2's nullable text: `placement` is part of the dedup unique
    // key, and a NULL in a unique key defeats the constraint it is there to
    // enforce. Both V1 write paths already require it (`if (!placement) 400`).
    t.text("placement").notNullable();

    // PII. Never returned by any read — see ads.repository.ts, which lists its
    // columns explicitly on every select for exactly this reason.
    t.integer("viewer_user_id").unsigned().notNullable()
      .references("id").inTable("platform_users").onDelete("CASCADE");
    t.text("viewer_fingerprint").nullable();

    t.timestamp("viewed_at").notNullable().defaultTo(knex.fn.now());
    t.boolean("is_click").notNullable().defaultTo(false);
    t.decimal("cost_charged", 12, 2).notNullable().defaultTo(0);
  });

  await knex.raw(`
    ALTER TABLE ad_impressions
      ADD COLUMN viewed_hour timestamp
        GENERATED ALWAYS AS (date_trunc('hour', viewed_at AT TIME ZONE 'UTC')) STORED
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX ad_impressions_dedup_uniq
      ON ad_impressions (campaign_id, placement, viewer_user_id, viewed_hour)
  `);
  await knex.raw(`CREATE INDEX ad_impressions_campaign_idx ON ad_impressions (campaign_id, viewed_at DESC)`);
  await knex.raw(`ALTER TABLE ad_impressions ADD CONSTRAINT ad_impressions_cost_check CHECK (cost_charged >= 0)`);

  await knex.schema.createTable("ad_leads", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();

    t.integer("campaign_id").unsigned().notNullable()
      .references("id").inTable("ad_campaigns").onDelete("CASCADE");
    t.integer("creative_id").unsigned().nullable()
      .references("id").inTable("ad_creatives").onDelete("SET NULL");
    t.text("placement").notNullable();

    // PII, and the reason ads.repository.ts never selects *. The analytics read
    // returns lead COUNTS and types, never who the lead was — matching V2, whose
    // analytics projection deliberately omits user_id.
    t.integer("user_id").unsigned().notNullable()
      .references("id").inTable("platform_users").onDelete("CASCADE");

    t.text("lead_type").notNullable().defaultTo("click")
      .checkIn([...LEAD_TYPES], "ad_leads_lead_type_check");
    t.decimal("cost_charged", 12, 2).notNullable().defaultTo(0);

    t.timestamps(true, true);
  });

  await knex.schema.alterTable("ad_leads", (t) => {
    t.check("cost_charged >= 0", [], "ad_leads_cost_check");
    t.index(["campaign_id", "created_at"], "ad_leads_campaign_idx");
  });

  // Same story as impressions: V1 counted-then-inserted over a rolling 24h
  // window. The bucket here is the UTC day.
  await knex.raw(`
    ALTER TABLE ad_leads
      ADD COLUMN created_day date
        GENERATED ALWAYS AS ((created_at AT TIME ZONE 'UTC')::date) STORED
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX ad_leads_dedup_uniq
      ON ad_leads (campaign_id, user_id, lead_type, created_day)
  `);

  await knex.schema.createTable("ad_dismissed", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();

    t.integer("user_id").unsigned().notNullable()
      .references("id").inTable("platform_users").onDelete("CASCADE");
    t.integer("campaign_id").unsigned().notNullable()
      .references("id").inTable("ad_campaigns").onDelete("CASCADE");

    t.timestamps(true, true);

    t.unique(["user_id", "campaign_id"], { indexName: "ad_dismissed_user_campaign_uniq" });
    t.index(["user_id"], "ad_dismissed_user_idx");
  });

  await knex.schema.createTable("ad_reports", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();

    t.integer("campaign_id").unsigned().notNullable()
      .references("id").inTable("ad_campaigns").onDelete("CASCADE");
    t.integer("creative_id").unsigned().nullable()
      .references("id").inTable("ad_creatives").onDelete("SET NULL");
    // PII in the same sense as ad_leads.user_id: who complained is admin-only.
    t.integer("reporter_user_id").unsigned().notNullable()
      .references("id").inTable("platform_users").onDelete("CASCADE");

    t.text("reason").notNullable().defaultTo("inappropriate")
      .checkIn([...REPORT_REASONS], "ad_reports_reason_check");
    t.text("details").nullable();
    t.text("status").notNullable().defaultTo("pending")
      .checkIn([...REPORT_STATUSES], "ad_reports_status_check");

    t.timestamps(true, true);

    // One open report per reporter per campaign — V1 let a single user file the
    // same complaint unboundedly, which is how a moderation queue gets flooded.
    t.unique(["campaign_id", "reporter_user_id"], { indexName: "ad_reports_campaign_reporter_uniq" });
    t.index(["status"], "ad_reports_status_idx");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("ad_reports");
  await knex.schema.dropTableIfExists("ad_dismissed");
  await knex.schema.dropTableIfExists("ad_leads");
  await knex.schema.dropTableIfExists("ad_impressions");
}
