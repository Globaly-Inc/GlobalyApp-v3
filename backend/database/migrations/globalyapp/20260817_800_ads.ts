// Ad campaigns, creatives and placements (Wave G5).
//
// Schema spec: V2 `ad_campaigns` / `ad_creatives` / `ad_placements`
// (apps/core-api/src/db/schema/schema.ts). Behavioural spec: V1's
// `record-ad-impression` / `record-ad-lead` edge functions and AdminAds.tsx.
//
// PLACEMENT (master plan §1.2). Master (`public`), not a tenant schema:
//   * a campaign is owned by ONE business but is *served to* platform users
//     across every tenant, and ad_impressions / ad_leads / ad_dismissed all FK
//     into platform_users. A row with FKs on both sides of a tenant boundary
//     can never live inside one tenant's schema.
//   * the super-admin moderation queue (admin/marketing/ads) is a single list
//     across all businesses, which a per-tenant table cannot express without
//     fanning out one query per tenant.
// Isolation is therefore enforced in code: every owner-scoped query filters on
// business_id taken from req.business (resolved by tenant.plugin from the JWT's
// orgId), never from a path or body. Same contract as enquiry_distributions.
//
// ── DENORMALISED COUNTERS (deliberate divergence from V1/V2) ──
// impressions_count / clicks_count / leads_count are NOT a cache. They are the
// mechanism that makes per-1,000-impression credit billing correct, replacing
// V1's `SELECT count(*) FROM ad_impressions WHERE campaign_id = ?` on EVERY
// impression, which is both:
//   * O(rows) per request — the one query in the hot path that grows without
//     bound as a campaign succeeds, and
//   * racy — V1 then tested `total % 1000 === 0` against that count and billed.
//     Two impressions landing together both read 999 (neither bills) or both
//     read 1000 (double bill). See ads.service.ts recordImpression: V3 does
//     `UPDATE ... SET impressions_count = impressions_count + 1 RETURNING`,
//     a single atomic increment whose returned value is a unique sequence
//     number per impression, so the 1,000th is billed exactly once.
// Reported as defect D-G5-1.

import type { Knex } from "knex";

const OBJECTIVES = ["awareness", "traffic", "leads", "engagement"] as const;
const STATUSES = ["draft", "pending_review", "active", "paused", "rejected", "completed"] as const;
const BUDGET_TYPES = ["daily", "lifetime"] as const;
const COST_MODELS = ["cpv", "cpl", "cpc", "flat"] as const;
const MEDIA_TYPES = ["image", "video"] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("ad_campaigns", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique(); // stage-2 loader idempotency key

    t.integer("business_id").unsigned().notNullable()
      .references("id").inTable("businesses").onDelete("CASCADE");
    // V2 has created_by NOT NULL. Nullable + SET NULL here because the actor may
    // later be deleted and losing a person must not delete their campaigns —
    // same reasoning as enquiry_unlocks.unlocked_by.
    t.integer("created_by").unsigned().nullable()
      .references("id").inTable("platform_users").onDelete("SET NULL");

    t.text("name").notNullable();
    t.text("objective").notNullable().defaultTo("awareness")
      .checkIn([...OBJECTIVES], "ad_campaigns_objective_check");
    t.text("status").notNullable().defaultTo("draft")
      .checkIn([...STATUSES], "ad_campaigns_status_check");

    // numeric, not float: this is money-adjacent (budget vs spend decides whether
    // an ad is still served). V2 used unconstrained `numeric`; a scale makes the
    // stored value and the rendered value the same number.
    t.text("budget_type").notNullable().defaultTo("lifetime")
      .checkIn([...BUDGET_TYPES], "ad_campaigns_budget_type_check");
    t.decimal("budget_amount", 12, 2).notNullable().defaultTo(0);
    t.decimal("spent_amount", 12, 2).notNullable().defaultTo(0);
    t.text("cost_model").notNullable().defaultTo("cpv")
      .checkIn([...COST_MODELS], "ad_campaigns_cost_model_check");
    t.decimal("cost_per_unit", 12, 2).notNullable().defaultTo(1);

    t.timestamp("starts_at").nullable();
    t.timestamp("ends_at").nullable();

    t.specificType("target_audiences", "text[]").notNullable().defaultTo("{}");
    t.specificType("target_countries", "text[]").notNullable().defaultTo("{}");
    t.specificType("target_study_fields", "text[]").notNullable().defaultTo("{}");

    t.boolean("auto_pause_at_budget").notNullable().defaultTo(true);

    // Admin moderation (V1 AdminAds.tsx: approve → active, reject + reason, force-pause).
    t.text("rejection_reason").nullable();
    // App-level FK to superadmin.admin_users.id — a real FK is impossible because
    // the globalyapp migrations run before the superadmin ones. Same precedent as
    // scholarships.reviewed_by.
    t.integer("reviewed_by").unsigned().nullable();
    t.timestamp("reviewed_at").nullable();

    // See the header: these are the billing sequence, not a cache.
    t.integer("impressions_count").notNullable().defaultTo(0);
    t.integer("clicks_count").notNullable().defaultTo(0);
    t.integer("leads_count").notNullable().defaultTo(0);
    // How many whole 1,000-impression blocks have already been billed. Carried so
    // the biller is a comparison against committed state rather than an inference
    // from a modulus, which is what breaks the moment the block size changes.
    t.integer("billed_impression_blocks").notNullable().defaultTo(0);

    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();

    t.index(["business_id", "status"], "ad_campaigns_business_status_idx");
    t.index(["status"], "ad_campaigns_status_idx");
  });

  await knex.schema.alterTable("ad_campaigns", (t) => {
    t.check("budget_amount >= 0 AND spent_amount >= 0 AND cost_per_unit >= 0", [], "ad_campaigns_amounts_check");
    t.check(
      "impressions_count >= 0 AND clicks_count >= 0 AND leads_count >= 0 AND billed_impression_blocks >= 0",
      [],
      "ad_campaigns_counters_check",
    );
    // A rejection must carry its reason: V1's admin page always sent one, but
    // nothing stopped a caller rejecting silently and leaving the advertiser with
    // no way to find out why.
    t.check(
      "status <> 'rejected' OR rejection_reason IS NOT NULL",
      [],
      "ad_campaigns_rejection_reason_check",
    );
    t.check("ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at", [], "ad_campaigns_window_check");
  });

  // The public serve query starts from "which live campaigns cover this
  // placement", so the hot index is partial on exactly that predicate.
  await knex.raw(`
    CREATE INDEX ad_campaigns_live_idx ON ad_campaigns (id)
      WHERE status = 'active' AND deleted_at IS NULL
  `);

  await knex.schema.createTable("ad_creatives", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();

    t.integer("campaign_id").unsigned().notNullable()
      .references("id").inTable("ad_campaigns").onDelete("CASCADE");

    t.text("media_type").notNullable().defaultTo("image")
      .checkIn([...MEDIA_TYPES], "ad_creatives_media_type_check");
    // media_url / thumbnail_url / cta_url are all rendered into an <img src> or an
    // anchor href by the frontend, so they are validated with webUrl() at the
    // route boundary (shared/url.ts) — never z.string().url().
    t.text("media_url").notNullable();
    t.text("thumbnail_url").nullable();
    t.text("headline").nullable();
    t.text("description").nullable();
    t.text("cta_text").nullable().defaultTo("Learn More");
    t.text("cta_url").nullable();
    t.boolean("is_active").notNullable().defaultTo(true);
    t.integer("sort_order").notNullable().defaultTo(0);

    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();

    t.index(["campaign_id", "sort_order"], "ad_creatives_campaign_idx");
  });

  await knex.schema.createTable("ad_placements", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();

    t.integer("campaign_id").unsigned().notNullable()
      .references("id").inTable("ad_campaigns").onDelete("CASCADE");
    t.text("placement").notNullable();
    t.boolean("is_active").notNullable().defaultTo(true);

    t.timestamps(true, true);

    t.unique(["campaign_id", "placement"], { indexName: "ad_placements_campaign_placement_uniq" });
    t.index(["placement", "is_active"], "ad_placements_placement_idx");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("ad_placements");
  await knex.schema.dropTableIfExists("ad_creatives");
  await knex.raw(`DROP INDEX IF EXISTS ad_campaigns_live_idx`);
  await knex.schema.dropTableIfExists("ad_campaigns");
}
