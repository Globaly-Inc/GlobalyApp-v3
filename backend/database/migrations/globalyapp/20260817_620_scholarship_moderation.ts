// Scholarship moderation, ownership and eligibility criteria (Wave G1).
//
// This EXTENDS the table created by 20260817_001_scholarships.ts rather than
// editing it: that migration arrived on an in-flight branch (PR #57), and
// rewriting a file another PR still owns turns a clean merge into a conflict for
// no gain. Everything below is additive.
//
// WHAT V1 AND V2 ACTUALLY MODEL — and what they do not
// V1's AdminScholarships.tsx and V2's routes/scholarships.ts expose exactly two
// admin verbs: toggle is_published and toggle is_featured. Neither system has a
// pending or rejected state anywhere. Wave G1 requires submission → pending →
// approved/rejected, so `review_status` is an ADDITION, kept deliberately thin:
// one status, one note, and who/when.
//
// is_published keeps its V2 meaning — the single predicate every public read
// filters on — and the moderation verbs drive it: approve may publish, reject
// always unpublishes. The CHECK below makes "a rejected listing is never publicly
// visible" a property of the table rather than of every caller remembering to add
// a second predicate.
//
// OWNERSHIP
// V2 had `business_id uuid NOT NULL` plus an `is_platform_scholarship` flag,
// which meant a platform-owned scholarship had to point business_id at a
// placeholder row. V3 splits orgs into owner-backed `businesses` and unclaimed
// `institutions`, so this uses the nullable polymorphic (org_type, org_id) pair
// from 20260816_003_cross_tenant_tables.ts — null meaning "the platform owns it".
// App-level FK, same precedent as business_branches.

import type { Knex } from "knex";

const REVIEW_STATUSES = ["pending", "approved", "rejected"] as const;
const ORG_TYPES = ["business", "institution"] as const;

// V2 scholarship_eligibility_type, verbatim.
const ELIGIBILITY_TYPES = [
  "gpa_minimum",
  "language_score",
  "nationality",
  "age_limit",
  "work_experience",
  "essay_required",
  "interview_required",
  "references_required",
  "field_of_study",
  "gender",
  "financial_need",
  "enrollment_status",
  "other",
] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("scholarships", (t) => {
    t.uuid("v1_id").nullable().unique(); // stage-2 loader idempotency key

    t.text("owner_org_type").nullable();
    t.integer("owner_org_id").unsigned().nullable(); // app-level FK: businesses.id | institutions.id
    t.boolean("is_platform_scholarship").notNullable().defaultTo(false);

    t.integer("created_by").unsigned().nullable()
      .references("id").inTable("platform_users").onDelete("SET NULL");
    t.text("source_sheet").nullable(); // V2 column — the import provenance

    t.text("review_status").notNullable().defaultTo("pending")
      .checkIn([...REVIEW_STATUSES], "scholarships_review_status_check");
    t.text("review_note").nullable();
    // App-level FK to superadmin.admin_users.id — a real one is impossible here
    // because the globalyapp migrations run before the superadmin ones.
    t.integer("reviewed_by").unsigned().nullable();
    t.timestamp("reviewed_at").nullable();

    // Every other V3 table family soft-deletes; 20260817_001 hard-deleted, which
    // makes an accidental admin DELETE unrecoverable.
    t.timestamp("deleted_at").nullable();

    t.index(["owner_org_type", "owner_org_id"], "scholarships_owner_idx");
    t.index(["review_status"], "scholarships_review_status_idx");
  });

  await knex.schema.alterTable("scholarships", (t) => {
    t.check(
      "(owner_org_type IS NULL AND owner_org_id IS NULL)" +
        " OR (owner_org_type IS NOT NULL AND owner_org_id IS NOT NULL)",
      [],
      "scholarships_owner_org_pair_check",
    );
    t.check(
      `owner_org_type IS NULL OR owner_org_type IN ('${ORG_TYPES.join("','")}')`,
      [],
      "scholarships_owner_org_type_check",
    );
    t.check(
      "NOT (is_published AND review_status = 'rejected')",
      [],
      "scholarships_rejected_not_published_check",
    );
  });

  // Rows that predate moderation were created by an admin through the CRUD API,
  // so a published one is approved by construction and a draft stays pending.
  await knex("scholarships").where({ is_published: true }).update({ review_status: "approved" });

  // The list/facet reads all start from is_published, so the hot index is partial
  // on exactly that — same shape as catalog_services_live_*.
  await knex.raw(`
    CREATE INDEX scholarships_live_featured_idx
      ON scholarships (is_featured DESC, deadline ASC NULLS LAST)
      WHERE is_published AND deleted_at IS NULL
  `);
  await knex.raw(`CREATE INDEX scholarships_degree_levels_idx ON scholarships USING gin (degree_levels)`);

  // Slug generation reuses the org trigger from 20260817_004_org_slugs.ts rather
  // than growing a second slugifier. set_org_public_slug() is already generic over
  // (prefix, name column) via tg_argv, and appending the row's own id makes the
  // value unique by construction — no retry loop, no uniqueness probe, no race
  // between two submitters with the same title. NOT NULL still holds: a BEFORE
  // INSERT trigger runs after the serial default is applied and before the
  // constraint is checked. A caller may still set the slug explicitly (the admin
  // CRUD API does, and the V1 loader will carry original URLs across), because the
  // trigger only fires when slug IS NULL.
  await knex.raw(`
    create trigger scholarships_set_public_slug
      before insert on public.scholarships
      for each row
      execute function public.set_org_public_slug('s', 'title');
  `);
  await knex.raw(`ALTER TABLE scholarships ALTER COLUMN slug DROP NOT NULL`);

  // V2's scholarship_eligibility_criteria — the `criteria` array its detail
  // response returns, which 20260817_001 has no table for.
  await knex.schema.createTable("scholarship_eligibility_criteria", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();
    t.integer("scholarship_id").unsigned().notNullable()
      .references("id").inTable("scholarships").onDelete("CASCADE");
    t.text("criteria_type").notNullable()
      .checkIn([...ELIGIBILITY_TYPES], "scholarship_eligibility_criteria_type_check");
    t.text("label").notNullable();
    t.text("value").nullable();
    t.text("operator").nullable().defaultTo(">=");
    t.boolean("is_mandatory").notNullable().defaultTo(true);
    t.text("notes").nullable();
    t.integer("sort_order").notNullable().defaultTo(0);
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();

    t.index(["scholarship_id", "sort_order"], "scholarship_eligibility_scholarship_idx");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("scholarship_eligibility_criteria");
  await knex.raw(`drop trigger if exists scholarships_set_public_slug on public.scholarships`);
  await knex.raw(`DROP INDEX IF EXISTS scholarships_degree_levels_idx`);
  await knex.raw(`DROP INDEX IF EXISTS scholarships_live_featured_idx`);

  await knex.schema.alterTable("scholarships", (t) => {
    t.dropChecks([
      "scholarships_owner_org_pair_check",
      "scholarships_owner_org_type_check",
      "scholarships_rejected_not_published_check",
    ]);
    t.dropIndex([], "scholarships_owner_idx");
    t.dropIndex([], "scholarships_review_status_idx");
    t.dropColumn("deleted_at");
    t.dropColumn("reviewed_at");
    t.dropColumn("reviewed_by");
    t.dropColumn("review_note");
    t.dropColumn("review_status");
    t.dropColumn("source_sheet");
    t.dropColumn("created_by");
    t.dropColumn("is_platform_scholarship");
    t.dropColumn("owner_org_id");
    t.dropColumn("owner_org_type");
    t.dropColumn("v1_id");
  });

  await knex.raw(`UPDATE scholarships SET slug = 'scholarship-' || id WHERE slug IS NULL`);
  await knex.raw(`ALTER TABLE scholarships ALTER COLUMN slug SET NOT NULL`);
}
