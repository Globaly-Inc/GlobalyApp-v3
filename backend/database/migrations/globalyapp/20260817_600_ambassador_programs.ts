// Ambassador programs + applications. Wave G4.
//
// Spec: V2 `ambassador_programs` / `ambassador_applications` /
// `ambassador_application_notes` (routes/business-ambassador-programs.ts,
// routes/ambassador-apply.ts) and V1's ambassador Supabase tables.
//
// Master (`public`) tier, not per-tenant: a program is owned by ONE business but
// is read by prospective students from any portal (the public program page, the
// apply form) and by platform admins across all businesses. Same reasoning as
// 20260817_100_enquiries — anything a student touches lives in master.
// Cross-tenant isolation is therefore a predicate, not a schema boundary: every
// business-scoped read filters on `business_id` taken from req.business.

import type { Knex } from "knex";

const PROGRAM_STATUSES = ["draft", "active", "paused", "archived"] as const;
const APPLICATION_STATUSES = ["pending", "accepted", "rejected", "withdrawn"] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("ambassador_programs", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();

    t.integer("business_id").unsigned().notNullable()
      .references("id").inTable("businesses").onDelete("CASCADE");
    t.text("name").notNullable();
    // Slug is the public URL key (`GET /ambassadors/programs/:idOrSlug`), so it is
    // unique platform-wide rather than per business — two businesses cannot claim
    // the same public address.
    t.text("slug").notNullable().unique();
    t.text("description").nullable();
    t.text("welcome_video_url").nullable();
    t.text("status").notNullable().defaultTo("draft")
      .checkIn([...PROGRAM_STATUSES], "ambassador_programs_status_check");

    // Free-form program configuration, carried verbatim from V2's jsonb columns.
    t.jsonb("application_stages").notNullable().defaultTo("[]");
    t.jsonb("compensation_model").notNullable().defaultTo("{}");
    t.jsonb("requirements").notNullable().defaultTo("{}");

    t.integer("created_by").unsigned().nullable()
      .references("id").inTable("platform_users").onDelete("SET NULL");

    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();

    t.index(["business_id", "status"], "ambassador_programs_business_status_idx");
  });

  await knex.schema.createTable("ambassador_applications", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();

    t.integer("program_id").unsigned().notNullable()
      .references("id").inTable("ambassador_programs").onDelete("CASCADE");
    t.integer("student_id").unsigned().notNullable()
      .references("id").inTable("platform_users").onDelete("CASCADE");

    t.text("current_stage").nullable();
    t.text("status").notNullable().defaultTo("pending")
      .checkIn([...APPLICATION_STATUSES], "ambassador_applications_status_check");
    t.jsonb("application_data").notNullable().defaultTo("{}");
    t.text("video_url").nullable();
    t.jsonb("documents").nullable();

    t.timestamp("submitted_at").nullable();
    t.timestamp("reviewed_at").nullable();
    t.timestamp("decided_at").nullable();
    t.timestamps(true, true);

    // V2 relies on this unique to answer "already applied" with a 409.
    t.unique(["program_id", "student_id"], { indexName: "ambassador_applications_program_student_uniq" });
    t.index(["student_id"], "ambassador_applications_student_idx");
  });

  // One mutable note blob per application — V2 models this as a single row with
  // no author column, not a list, so the PK is the application id itself.
  await knex.schema.createTable("ambassador_application_notes", (t) => {
    t.integer("application_id").unsigned().primary()
      .references("id").inTable("ambassador_applications").onDelete("CASCADE");
    t.text("notes").nullable();
    t.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("ambassador_application_notes");
  await knex.schema.dropTableIfExists("ambassador_applications");
  await knex.schema.dropTableIfExists("ambassador_programs");
}
