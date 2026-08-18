// Test-provider logos — the 10 reference rows behind the language/academic test
// pickers (IELTS, TOEFL, PTE, SAT, GRE, …).
//
// V1 kept them in public.test_provider_logos and V3 had no home for them, which
// left the table `blocked` in the migration ledger. Owner decision (§15): they
// are reference data and land in `public` as their own small table, so the
// picker reads rows rather than a hardcoded map.
//
// `logo_url` holds V1's supabase.co object URLs verbatim. That is deliberate:
// W6 (storage rehost) walks the referring columns and rewrites them once each
// object has an uploaded_files row, exactly as it does for businesses.logo_url
// and platform_users.photo_url. The URLs stay valid until V1's project is
// deleted — which is why W6 must run before that happens.

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("test_provider_logos", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique(); // Stage-2 idempotency key, never the PK
    t.text("test_type").notNullable().unique(); // IELTS | TOEFL | SAT | … — the natural key
    t.text("category").notNullable().checkIn(["language", "academic"], "test_provider_logos_category_check");
    t.text("logo_url").nullable(); // supabase.co today; rewritten by W6 storage rehost
    t.integer("sort_order").notNullable().defaultTo(0);
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("test_provider_logos");
}
