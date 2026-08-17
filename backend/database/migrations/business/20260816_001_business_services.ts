// Per-tenant service catalog — core table (V1 public.business_services, 402 rows).
//
// Runs inside each business's own schema, so V1's `business_id` is implicit and
// dropped. uuid PK: schema_field_values.entity_id is a uuid keyed on
// entity_type='business_services', and the master-side cross-tenant tables
// reference these ids too.
//
// Cross-schema references (service_categories, degree_levels, areas_of_study in
// the master schema) are app-level FKs with a comment — same precedent as
// agents.platform_user_id. Nullable because V1 ids may not resolve; the loader
// reports unresolved values rather than dropping the row.
//
// V1's `embedding vector(1536)` is deliberately omitted: all 402 V1 rows have
// embedding IS NULL, and a per-tenant pgvector column + hnsw index would be
// multiplied across every business schema for zero data. Wave E1 owns embeddings.

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("business_services", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("v1_id").nullable().unique(); // loader idempotency key

    t.integer("service_category_id").nullable(); // app-level FK to master service_categories.id
    t.text("name").notNullable();
    t.text("slug").nullable();
    t.text("description").nullable();
    t.text("overview").nullable();

    t.decimal("price", null).nullable();
    t.text("price_currency").nullable().defaultTo("AUD");
    t.text("price_type").nullable().defaultTo("fixed");

    t.integer("duration_value").nullable();
    t.text("duration_unit").nullable().defaultTo("months");

    t.text("image_url").nullable();
    t.text("brochure_url").nullable();
    t.specificType("tags", "text[]").nullable();
    t.jsonb("gallery_urls").notNullable().defaultTo("[]");

    t.integer("degree_level_id").nullable(); // app-level FK to master degree_levels.id
    t.integer("area_of_study_id").nullable(); // app-level FK to master areas_of_study.id
    t.specificType("study_mode", "text[]").nullable();

    // Awarding body may be an unclaimed institution, hence the polymorphic pair
    // (see globalyapp/20260816_003_cross_tenant_tables.ts).
    t.text("awarded_by_org_type").nullable()
      .checkIn(["business", "institution"], "business_services_awarded_by_org_type_check");
    t.integer("awarded_by_org_id").nullable(); // app-level FK to master businesses.id | institutions.id

    t.boolean("is_published").notNullable().defaultTo(false);
    t.boolean("is_featured").notNullable().defaultTo(false);
    t.jsonb("public_visibility").notNullable().defaultTo("{}");

    t.jsonb("category_specific_data").notNullable().defaultTo("{}"); // mirrors schema_field_values
    t.jsonb("meta").defaultTo("{}");
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();

    t.index(["is_published", "service_category_id"], "business_services_published_category_idx");
    t.index(["slug"], "business_services_slug_idx");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("business_services");
}
