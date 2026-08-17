// Cross-tenant tables — inherently business↔business, so they live in the master
// schema, never in a tenant schema (Wave M6: "cross-tenant tables go in master").
//
// Org references are polymorphic (org_type, org_id): V3 splits V1's single
// `businesses` table into `businesses` (owner-backed, has a tenant schema) and
// `institutions` (unclaimed directory listings — see 20260816_001). Only 5 of
// V1's 27 branch edges have an owner on both ends, so a plain FK to `businesses`
// would drop most of this graph. App-level FK, same precedent as
// agents.platform_user_id — see the org_type/org_id comments below.
//
// service_id / study_option_id are uuids living inside a tenant schema, so each
// row also carries owner_org_* to say *which* schema resolves them.

import type { Knex } from "knex";

const ORG_TYPES = ["business", "institution"] as const;

/** (type, id) pair addressing either businesses.id or institutions.id. App-level FK. */
function orgRef(t: Knex.CreateTableBuilder, prefix: string): void {
  t.text(`${prefix}_org_type`)
    .notNullable()
    .checkIn([...ORG_TYPES], `${prefix}_org_type_check`);
  t.integer(`${prefix}_org_id`).unsigned().notNullable(); // app-level FK to businesses.id | institutions.id
}

export async function up(knex: Knex): Promise<void> {
  // ── business_branches — business↔business graph (V1: 27) ──
  await knex.schema.createTable("business_branches", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();
    orgRef(t, "parent");
    orgRef(t, "child");
    t.text("branch_type")
      .notNullable()
      .defaultTo("same_company")
      .checkIn(["same_company", "subsidiary", "franchise"], "business_branches_branch_type_check");
    t.jsonb("meta").defaultTo("{}");
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
    t.unique(["parent_org_type", "parent_org_id", "child_org_type", "child_org_id"], {
      indexName: "business_branches_pair_unique",
    });
    t.index(["child_org_type", "child_org_id"], "business_branches_child_idx");
    t.check(
      "NOT (parent_org_type = child_org_type AND parent_org_id = child_org_id)",
      [],
      "business_branches_no_self_check",
    );
  });

  // ── representations — agent↔institution contracts (V1: 10) ──
  await knex.schema.createTable("representations", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();
    orgRef(t, "agent");
    orgRef(t, "institution");
    t.text("status")
      .notNullable()
      .defaultTo("pending")
      .checkIn(["pending", "active", "rejected", "expired"], "representations_status_check");
    t.integer("initiated_by").unsigned().nullable().references("id").inTable("platform_users").onDelete("SET NULL");
    t.specificType("regions", "text[]").nullable();
    t.specificType("services", "text[]").nullable();
    t.text("contract_url").nullable();
    t.date("valid_from").nullable();
    t.date("valid_until").nullable();
    t.text("notes").nullable();
    t.integer("responded_by").unsigned().nullable().references("id").inTable("platform_users").onDelete("SET NULL");
    t.timestamp("responded_at").nullable();
    t.jsonb("meta").defaultTo("{}");
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
    t.unique(["agent_org_type", "agent_org_id", "institution_org_type", "institution_org_id"], {
      indexName: "representations_pair_unique",
    });
    t.index(["institution_org_type", "institution_org_id"], "representations_institution_idx");
  });

  // ── service_branch_sharing — a tenant's service shared with another org (V1: 169) ──
  await knex.schema.createTable("service_branch_sharing", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();
    t.uuid("service_id").notNullable(); // app-level FK to <owner schema>.business_services.id
    orgRef(t, "owner"); // which tenant schema resolves service_id
    orgRef(t, "branch"); // who it is shared with
    t.text("scope")
      .notNullable()
      .defaultTo("read_only")
      .checkIn(["read_only", "manage", "office_data"], "service_branch_sharing_scope_check");
    t.integer("shared_by").unsigned().nullable().references("id").inTable("platform_users").onDelete("SET NULL");
    t.timestamp("shared_at").notNullable().defaultTo(knex.fn.now());
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
    t.unique(["service_id", "branch_org_type", "branch_org_id"], {
      indexName: "service_branch_sharing_service_branch_unique",
    });
    t.index(["branch_org_type", "branch_org_id"], "service_branch_sharing_branch_idx");
    t.index(["owner_org_type", "owner_org_id"], "service_branch_sharing_owner_idx");
  });

  // ── service_study_option_branches — study option shared with a branch (V1: 19) ──
  await knex.schema.createTable("service_study_option_branches", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();
    t.uuid("study_option_id").notNullable(); // app-level FK to <owner schema>.service_study_options.id
    orgRef(t, "owner");
    orgRef(t, "branch");
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
    t.unique(["study_option_id", "branch_org_type", "branch_org_id"], {
      indexName: "service_study_option_branches_unique",
    });
    t.index(["branch_org_type", "branch_org_id"], "service_study_option_branches_branch_idx");
  });

  // ── business_allowed_categories — which service categories an org may publish (V1: 34) ──
  await knex.schema.createTable("business_allowed_categories", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();
    orgRef(t, "owner");
    t.integer("service_category_id").unsigned().notNullable()
      .references("id").inTable("service_categories").onDelete("CASCADE");
    t.integer("granted_by").unsigned().nullable().references("id").inTable("platform_users").onDelete("SET NULL");
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
    t.unique(["owner_org_type", "owner_org_id", "service_category_id"], {
      indexName: "business_allowed_categories_unique",
    });
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("business_allowed_categories");
  await knex.schema.dropTableIfExists("service_study_option_branches");
  await knex.schema.dropTableIfExists("service_branch_sharing");
  await knex.schema.dropTableIfExists("representations");
  await knex.schema.dropTableIfExists("business_branches");
}
