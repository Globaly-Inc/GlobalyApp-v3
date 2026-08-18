// Scholarships + eligibility criteria (Wave G1).
//
// ── why master (`public`) ──
// §1.2: a scholarship listing is read cross-tenant by the public directory and
// may be owned by a business, by an unclaimed institution, or by the platform
// itself. Nothing about it is business-private, and a per-tenant copy would turn
// "search every published scholarship" into an N-schema fan-out — the same
// argument catalog_services makes. So it lives in the master schema.
//
// ── shaped from V2 apps/core-api/src/db/schema/schema.ts ──
// Column set is V2's `scholarships` / `scholarship_eligibility_criteria`
// verbatim, transformed to V3 conventions:
//   * serial int PKs (§1.2.1) instead of uuids; `v1_id` carries the V1 uuid so a
//     stage-2 loader can re-run idempotently. V1 has zero rows today (§3.8) —
//     this is schema + build, no data migration.
//   * V2's four pgEnums become CHECK constraints, the shape every other V3
//     migration uses (enquiry statuses, business_services awarded_by types).
//   * V2's `business_id uuid NOT NULL` becomes the nullable polymorphic org pair
//     (20260816_003_cross_tenant_tables.ts): V3 splits V1's single `businesses`
//     into owner-backed `businesses` and unclaimed `institutions`, and a
//     platform scholarship (`is_platform_scholarship`) has no owning org at all,
//     which V2 could only express by pointing business_id at a placeholder row.
//   * `degree_levels` stays a text[] rather than a junction to public.degree_levels.
//     It is a facet, not a relationship: the public facets endpoint unnests it and
//     counts, exactly as V2's RPC did. A junction would buy a join and change the
//     wire shape for nothing.
//
// ── moderation, which V1 and V2 do NOT have ──
// V1's AdminScholarships.tsx and V2's scholarships.ts model exactly two admin
// verbs: toggle `is_published` and toggle `is_featured`. There is no pending or
// rejected state anywhere in either system. Wave G1 requires submission →
// pending → approved/rejected, so `review_status` is an ADDITION, kept minimal:
// one status, one note, and who/when. `is_published` keeps its V2 meaning (the
// single predicate every public read filters on) and the moderation verbs drive
// it — approve may publish, reject always unpublishes — so a rejected listing can
// never be publicly visible without the read path growing a second gate.

import type { Knex } from "knex";

// V2 scholarship_basis
const BASES = ["merit", "need", "sports", "diversity", "government", "research", "other"] as const;
// V2 scholarship_coverage_type
const COVERAGE_TYPES = [
  "full_tuition",
  "partial_tuition",
  "stipend",
  "living_allowance",
  "various",
  "other",
] as const;
// V2 scholarship_source_type
const SOURCE_TYPES = ["university", "independent", "government", "foundation", "other"] as const;
// V2 scholarship_eligibility_type
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

const REVIEW_STATUSES = ["pending", "approved", "rejected"] as const;
const ORG_TYPES = ["business", "institution"] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("scholarships", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();

    // Owning org — nullable for platform scholarships. App-level FK to
    // businesses.id | institutions.id, same precedent as business_branches.
    t.text("owner_org_type").nullable();
    t.integer("owner_org_id").unsigned().nullable();
    t.boolean("is_platform_scholarship").notNullable().defaultTo(false);

    t.integer("created_by").unsigned().nullable()
      .references("id").inTable("platform_users").onDelete("SET NULL");
    t.text("source_sheet").nullable();

    t.text("title").notNullable();
    t.text("slug").notNullable().unique();
    t.text("description").nullable();
    t.text("provider_name").nullable();
    t.text("source_type").notNullable().defaultTo("university")
      .checkIn([...SOURCE_TYPES], "scholarships_source_type_check");

    t.text("country").nullable();
    t.text("city").nullable();
    t.text("region").nullable();

    t.text("basis").nullable().checkIn([...BASES], "scholarships_basis_check");
    t.specificType("degree_levels", "text[]").notNullable().defaultTo("{}");

    t.text("requirements_summary").nullable();
    t.text("coverage_type").notNullable().defaultTo("various")
      .checkIn([...COVERAGE_TYPES], "scholarships_coverage_type_check");
    t.decimal("coverage_amount", 12, 2).nullable();
    t.text("coverage_currency").notNullable().defaultTo("AUD");
    t.text("coverage_description").nullable();

    t.date("deadline").nullable();
    t.text("deadline_notes").nullable();
    t.text("application_url").nullable();
    t.text("source_url").nullable();

    t.boolean("is_published").notNullable().defaultTo(false);
    t.boolean("is_featured").notNullable().defaultTo(false);
    t.integer("view_count").notNullable().defaultTo(0);

    // Moderation (G1 addition — see header).
    t.text("review_status").notNullable().defaultTo("pending")
      .checkIn([...REVIEW_STATUSES], "scholarships_review_status_check");
    t.text("review_note").nullable();
    // App-level FK to superadmin.admin_users.id — a real FK is impossible here
    // because the globalyapp migrations run before the superadmin ones.
    t.integer("reviewed_by").unsigned().nullable();
    t.timestamp("reviewed_at").nullable();

    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();

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
    // A rejected listing must never be publicly readable. The public read filters
    // is_published alone (V2 parity), so the invariant is enforced here instead of
    // in a second predicate every caller could forget.
    t.check(
      "NOT (is_published AND review_status = 'rejected')",
      [],
      "scholarships_rejected_not_published_check",
    );

    t.index(["owner_org_type", "owner_org_id"], "scholarships_owner_idx");
    t.index(["review_status"], "scholarships_review_status_idx");
    t.index(["country"], "scholarships_country_idx");
    t.index(["basis"], "scholarships_basis_idx");
    t.index(["deadline"], "scholarships_deadline_idx");
  });

  // Every public list/facet read starts from is_published, so the hot index is
  // partial on exactly that — same shape as catalog_services_live_*.
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
  // between two admins submitting the same title. NOT NULL still holds: a BEFORE
  // INSERT trigger runs after the serial default is applied and before the
  // constraint is checked. A caller may still set the slug explicitly (the V1
  // loader carrying a row's original URL across), because the trigger only fires
  // when slug IS NULL.
  await knex.raw(`
    create trigger scholarships_set_public_slug
      before insert on public.scholarships
      for each row
      execute function public.set_org_public_slug('s', 'title');
  `);

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
  await knex.raw(`drop trigger if exists scholarships_set_public_slug on public.scholarships`);
  await knex.schema.dropTableIfExists("scholarship_eligibility_criteria");
  await knex.schema.dropTableIfExists("scholarships");
}
