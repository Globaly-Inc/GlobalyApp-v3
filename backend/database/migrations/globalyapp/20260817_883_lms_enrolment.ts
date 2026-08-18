// LMS enrolment: applications to join a programme, and email invitations to it.
// Wave E4.
//
// Spec: V2 routes/lms-enrollment.ts (`training_enrollment_applications`) and
// routes/lms-invitations.ts (`training_invitations`), with V1's
// lms-course-invite as the behavioural reference for the invite side.
// Master tier, same reasoning as the rest of the training family.
//
// ── training_invitations ──
// V1 had `UNIQUE (program_id, email)` and leaned on the 23505 for idempotency
// (20260613000001_lms_invitations_unique_constraint.sql). V2's introspected table
// lost it, and lms-invitations.ts does a bare INSERT with no onConflict — so
// hammering the endpoint creates unbounded duplicate rows AND re-sends the email
// every time. A self-serve email-spam amplifier gated only by membership
// (defect D-E4-6). The constraint is restored and the service upserts onto it.
//
// V1's `CHECK (status IN ('pending','accepted','expired'))` and its
// `invitee_user_id` column were also dropped by V2. Both are back: the column is
// what records that an invitation was taken up by an actual account.
//
// The token is 32 random bytes, matching V1's
// `encode(gen_random_bytes(32),'hex')`. V2 generated a `crypto.randomUUID()` —
// 122 bits rather than 256 — AND returned the token in the invitation LIST
// response to any accepted member (defect D-E4-7). It is never projected here.

import type { Knex } from "knex";

const APPLICATION_STATUSES = ["pending", "approved", "rejected"] as const;
const INVITATION_STATUSES = ["pending", "accepted", "expired"] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("training_enrollment_applications", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();

    t.integer("program_id").unsigned().notNullable()
      .references("id").inTable("training_programs").onDelete("CASCADE");
    t.integer("user_id").unsigned().notNullable()
      .references("id").inTable("platform_users").onDelete("CASCADE");

    t.text("status").notNullable().defaultTo("pending")
      .checkIn([...APPLICATION_STATUSES], "training_enrollment_applications_status_check");
    /** Answers to the programme's eligibility questions. V2 `answers_json`. */
    t.jsonb("answers_json").notNullable().defaultTo("{}");
    t.text("rejection_reason").nullable();

    t.integer("reviewed_by").unsigned().nullable()
      .references("id").inTable("platform_users").onDelete("SET NULL");
    t.timestamp("reviewed_at").nullable();
    t.timestamps(true, true);

    // One live application per person per programme. V2 had no constraint, so a
    // learner could stack applications and a reviewer could approve the same
    // person repeatedly.
    t.unique(["program_id", "user_id"], {
      indexName: "training_enrollment_applications_program_user_uniq",
    });
    t.index(["program_id", "status"], "training_enrollment_applications_status_idx");
    // A rejection says why. V2 required a reason in its zod body but the column
    // was free to be NULL, so V1's rows and any other writer could skip it.
    t.check(
      "status <> 'rejected' OR rejection_reason IS NOT NULL",
      [],
      "training_enrollment_applications_rejection_reason_check",
    );
    t.check(
      "(status = 'pending') = (reviewed_at IS NULL)",
      [],
      "training_enrollment_applications_reviewed_consistency_check",
    );
  });

  await knex.schema.createTable("training_invitations", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();

    t.integer("program_id").unsigned().notNullable()
      .references("id").inTable("training_programs").onDelete("CASCADE");
    t.text("email").notNullable();
    t.integer("invited_by").unsigned().nullable()
      .references("id").inTable("platform_users").onDelete("SET NULL");
    /** Set when the invitee turns out to have, or later gets, an account. */
    t.integer("invitee_user_id").unsigned().nullable()
      .references("id").inTable("platform_users").onDelete("SET NULL");

    t.text("invite_token").notNullable().unique();
    t.text("status").notNullable().defaultTo("pending")
      .checkIn([...INVITATION_STATUSES], "training_invitations_status_check");
    t.timestamp("expires_at").notNullable();
    t.timestamps(true, true);

    t.unique(["program_id", "email"], { indexName: "training_invitations_program_email_uniq" });
    t.index(["program_id", "status"], "training_invitations_program_status_idx");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("training_invitations");
  await knex.schema.dropTableIfExists("training_enrollment_applications");
}
