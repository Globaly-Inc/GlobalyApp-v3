// G7 — AI-embed widget: the columns 20260816_001_ai_embed_configs left out.
//
// Two groups of additions:
//
// 1. SECURITY (V3-only, no V1 equivalent). `allowed_origins` is the widget's
//    authorization boundary. V1's ai-embed-validate had NO domain allowlist at
//    all and served `Access-Control-Allow-Origin: *`, so any page anywhere could
//    spend a tenant's monthly credit budget with a scraped embed key. The column
//    is NOT NULL DEFAULT '{}' and an EMPTY array means DENY EVERY ORIGIN — the
//    default has to be the closed one, or a config created without thinking about
//    origins would be the open one.
//
// 2. V1 PARITY. V1's public.ai_embed_configs carried business_type,
//    welcome_message, starter_questions, scoped_institution_ids, scoped_agent_id
//    and overage_enabled; V3's table carried none of them. §3.2: reshape V3 to
//    carry the V1 feature in full rather than shrink the feature to fit V3.
//    V1's uuid[] scoping columns become integer[] here because V3 uses serial
//    int PKs (§3.2 non-negotiable).
//
// V1 names that V3 already covers under a different name are NOT duplicated:
// widget_name → display_name, primary_colour → brand_color.

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("ai_embed_configs", (t) => {
    t.specificType("allowed_origins", "text[]").notNullable().defaultTo("{}");
    t.text("business_type").nullable();
    t.text("welcome_message").nullable();
    t.specificType("starter_questions", "text[]").nullable();
    t.specificType("scoped_institution_ids", "integer[]").nullable();
    t.integer("scoped_agent_id").unsigned().nullable();
    t.boolean("overage_enabled").notNullable().defaultTo(false);
  });

  // Every widget request starts from (embed_key, is_active).
  await knex.raw(`
    CREATE INDEX ai_embed_configs_active_key_idx
      ON ai_embed_configs (embed_key)
      WHERE is_active
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS ai_embed_configs_active_key_idx`);
  await knex.schema.alterTable("ai_embed_configs", (t) => {
    t.dropColumns(
      "allowed_origins",
      "business_type",
      "welcome_message",
      "starter_questions",
      "scoped_institution_ids",
      "scoped_agent_id",
      "overage_enabled",
    );
  });
}
