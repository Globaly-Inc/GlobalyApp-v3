// Student applications to a business service / institution (Wave G5).
//
// Schema spec: V2 `applications` (student_id, service_id, institution_id, status).
//
// NOT job applications. `student_job_applications` (20260817_701, Wave G2) is a
// different thing: a student applying to a *job posting*. This is a student
// applying to a *service* offered by a business or institution — the row V1's
// `charge-application` edge function bills the receiving business for. Both exist;
// neither replaces the other.
//
// PLACEMENT (master plan §1.2): master (`public`). It FKs platform_users AND
// businesses/institutions, i.e. across a tenant boundary — same argument as
// student_job_applications, which 20260817_701 put here for the same reason.
//
// `service_id` carries NO foreign key. V3's service catalogue
// (`business_services`, migrations/business/20260816_001) is PER TENANT: a master
// table physically cannot reference it. It is an app-level FK resolved against
// req.db within the owning business's schema, and `org_id` is what makes that
// resolution unambiguous. Same precedent as business_branches.

import type { Knex } from "knex";

const STATUSES = [
  "draft",
  "submitted",
  "under_review",
  "accepted",
  "rejected",
  "withdrawn",
] as const;

const ORG_TYPES = ["business", "institution"] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("applications", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique(); // stage-2 loader idempotency key

    t.integer("student_id").unsigned().notNullable()
      .references("id").inTable("platform_users").onDelete("CASCADE");

    // V2 had `institution_id -> businesses.id`, which forced an institution to be
    // a business row. V3 splits those, so this uses the nullable polymorphic
    // (org_type, org_id) pair from 20260816_003_cross_tenant_tables.ts.
    t.text("org_type").nullable();
    t.integer("org_id").unsigned().nullable(); // app-level FK: businesses.id | institutions.id

    // The business that gets billed when this application is accepted. Denormalised
    // off (org_type, org_id) so the charge path and the business inbox filter on a
    // single indexed column — the same reason student_job_applications carries
    // business_id alongside job_id.
    t.integer("business_id").unsigned().nullable()
      .references("id").inTable("businesses").onDelete("CASCADE");

    // App-level FK into the owning tenant's business_services — see the header.
    t.integer("service_id").unsigned().nullable();

    t.text("status").notNullable().defaultTo("draft")
      .checkIn([...STATUSES], "applications_status_check");
    t.text("notes").nullable();
    t.timestamp("submitted_at").nullable();
    t.timestamp("decided_at").nullable();
    t.integer("decided_by").unsigned().nullable()
      .references("id").inTable("platform_users").onDelete("SET NULL");

    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();

    t.index(["student_id", "status"], "applications_student_idx");
    t.index(["business_id", "status"], "applications_business_idx");
    t.index(["org_type", "org_id"], "applications_org_idx");
  });

  await knex.schema.alterTable("applications", (t) => {
    t.check(
      "(org_type IS NULL AND org_id IS NULL) OR (org_type IS NOT NULL AND org_id IS NOT NULL)",
      [],
      "applications_org_pair_check",
    );
    t.check(
      `org_type IS NULL OR org_type IN ('${ORG_TYPES.join("','")}')`,
      [],
      "applications_org_type_check",
    );
    // A decision must record when it was made. V1 had no such column and the
    // admin charge list ordered by charged_at, which is why waived rows sorted
    // last forever.
    t.check(
      "status NOT IN ('accepted', 'rejected') OR decided_at IS NOT NULL",
      [],
      "applications_decided_at_check",
    );
  });

  // A student applies to one service once. Without this, "apply" is a button that
  // bills the business again on every double-click.
  await knex.raw(`
    CREATE UNIQUE INDEX applications_student_service_uniq
      ON applications (student_id, service_id)
      WHERE service_id IS NOT NULL AND deleted_at IS NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS applications_student_service_uniq`);
  await knex.schema.dropTableIfExists("applications");
}
