// Per-tenant service catalog — core table (V1 public.business_services, 402 rows).
//
// This migration ALTERS the thin listing table created by 20260811_002 rather
// than creating a second one. 20260811_002 stays the creator; two createTable
// calls for the same name made `migrate:latest` impossible from an empty
// database (same class of collision as credit_wallets). Master document §6, C1
// row: "extend the existing thin business_services with the fees/intakes/
// eligibility/study-options children + junctions".
//
// Reconciliation of the two column sets:
//
//   kept as-is  service_category_id (real FK to public.service_categories —
//               stronger than the app-level FK the catalog draft planned, and
//               it resolves because every tenant search_path ends in public),
//               name, description, created_at, updated_at, deleted_at
//   widened     price  numeric(8,2) -> numeric. V1 amounts are unbounded
//               numeric; 999_999.99 is a real ceiling for tuition.
//   tightened   is_published  nullable -> NOT NULL DEFAULT false
//   superseded  id. The thin table carried BOTH a serial `id` and a unique
//               `uuid`; the uuid was already the external identity (the
//               superadmin repository selects "uuid as id"), schema_field_values
//               .entity_id is a uuid keyed on entity_type='business_services',
//               the master-side cross-tenant tables hold a uuid service_id, and
//               every child/junction table below keys on uuid. The serial was
//               internal-only and unreferenced, so it is dropped and `uuid` is
//               renamed to `id` — the identity is preserved, the duplicate is
//               not. down() puts the serial back.
//   dropped     nothing else.
//
// Cross-schema references (degree_levels, areas_of_study in the master schema)
// stay app-level FKs with a comment — same precedent as agents.platform_user_id.
// Nullable because V1 ids may not resolve; the W7 loader reports unresolved
// values rather than dropping the row.
//
// V1's `embedding vector(1536)` is deliberately omitted: all 402 V1 rows have
// embedding IS NULL, and a per-tenant pgvector column + hnsw index would be
// multiplied across every business schema for zero data. Wave E1 owns embeddings.

import type { Knex } from "knex";

const TABLE = "business_services";

export async function up(knex: Knex): Promise<void> {
  // ── uuid becomes the primary key; the redundant serial goes ──
  // Dropping the column drops business_services_pkey with it.
  await knex.raw(`ALTER TABLE ?? DROP COLUMN "id"`, [TABLE]);
  await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS "business_services_uuid_unique"`, [TABLE]);
  await knex.raw(`ALTER TABLE ?? RENAME COLUMN "uuid" TO "id"`, [TABLE]);
  await knex.raw(`ALTER TABLE ?? ADD PRIMARY KEY ("id")`, [TABLE]);

  await knex.raw(`ALTER TABLE ?? ALTER COLUMN "price" TYPE numeric`, [TABLE]);
  await knex.raw(`ALTER TABLE ?? ALTER COLUMN "is_published" SET DEFAULT false`, [TABLE]);
  await knex.raw(`UPDATE ?? SET "is_published" = false WHERE "is_published" IS NULL`, [TABLE]);
  await knex.raw(`ALTER TABLE ?? ALTER COLUMN "is_published" SET NOT NULL`, [TABLE]);

  await knex.schema.alterTable(TABLE, (t) => {
    t.uuid("v1_id").nullable().unique(); // loader idempotency key

    t.text("slug").nullable();
    t.text("overview").nullable();

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

    t.boolean("is_featured").notNullable().defaultTo(false);
    t.jsonb("public_visibility").notNullable().defaultTo("{}");

    t.jsonb("category_specific_data").notNullable().defaultTo("{}"); // mirrors schema_field_values
    t.jsonb("meta").defaultTo("{}");

    t.index(["is_published", "service_category_id"], "business_services_published_category_idx");
    t.index(["slug"], "business_services_slug_idx");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable(TABLE, (t) => {
    t.dropIndex([], "business_services_published_category_idx");
    t.dropIndex([], "business_services_slug_idx");
    t.dropColumn("v1_id");
    t.dropColumn("slug");
    t.dropColumn("overview");
    t.dropColumn("price_currency");
    t.dropColumn("price_type");
    t.dropColumn("duration_value");
    t.dropColumn("duration_unit");
    t.dropColumn("image_url");
    t.dropColumn("brochure_url");
    t.dropColumn("tags");
    t.dropColumn("gallery_urls");
    t.dropColumn("degree_level_id");
    t.dropColumn("area_of_study_id");
    t.dropColumn("study_mode");
    t.dropColumn("awarded_by_org_type");
    t.dropColumn("awarded_by_org_id");
    t.dropColumn("is_featured");
    t.dropColumn("public_visibility");
    t.dropColumn("category_specific_data");
    t.dropColumn("meta");
  });

  await knex.raw(`ALTER TABLE ?? ALTER COLUMN "is_published" DROP NOT NULL`, [TABLE]);
  await knex.raw(`ALTER TABLE ?? ALTER COLUMN "price" TYPE numeric(8, 2)`, [TABLE]);

  await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT "business_services_pkey"`, [TABLE]);
  await knex.raw(`ALTER TABLE ?? RENAME COLUMN "id" TO "uuid"`, [TABLE]);
  await knex.raw(`ALTER TABLE ?? ADD CONSTRAINT "business_services_uuid_unique" UNIQUE ("uuid")`, [TABLE]);
  await knex.raw(`ALTER TABLE ?? ADD COLUMN "id" serial PRIMARY KEY`, [TABLE]);
}
