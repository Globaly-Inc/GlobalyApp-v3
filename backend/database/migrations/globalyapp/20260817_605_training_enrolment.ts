// Training enrolment: assignments, per-chapter progress, assessment attempts.
// Wave G4.
//
// Spec: V2 `training_assignments` / `training_progress` /
// `training_assessment_attempts` (routes/training.ts + routes/business-training.ts).
//
// `training_progress` is UNIQUE on (user_id, chapter_id) — V2's "Mark Complete"
// is an upsert onto exactly that target, so the constraint is load-bearing, not
// decorative. Note the pair is (user, chapter), NOT (user, program, chapter): a
// chapter belongs to one program, so program_id is denormalised for the
// per-program count query and must not widen the key.

import type { Knex } from "knex";

const PROGRESS_STATUSES = ["in_progress", "completed"] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("training_assignments", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();
    t.integer("program_id").unsigned().notNullable()
      .references("id").inTable("training_programs").onDelete("CASCADE");
    t.integer("user_id").unsigned().notNullable()
      .references("id").inTable("platform_users").onDelete("CASCADE");
    t.integer("assigned_by").unsigned().nullable()
      .references("id").inTable("platform_users").onDelete("SET NULL");
    t.timestamp("due_date").nullable();
    t.boolean("is_closed").notNullable().defaultTo(false);
    t.timestamps(true, true);

    // Assigning the same person twice is a no-op, not a duplicate enrolment.
    t.unique(["program_id", "user_id"], { indexName: "training_assignments_program_user_uniq" });
    t.index(["user_id"], "training_assignments_user_idx");
  });

  await knex.schema.createTable("training_progress", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();
    t.integer("user_id").unsigned().notNullable()
      .references("id").inTable("platform_users").onDelete("CASCADE");
    t.integer("program_id").unsigned().notNullable()
      .references("id").inTable("training_programs").onDelete("CASCADE");
    t.integer("chapter_id").unsigned().notNullable()
      .references("id").inTable("training_chapters").onDelete("CASCADE");
    t.text("status").notNullable().defaultTo("in_progress")
      .checkIn([...PROGRESS_STATUSES], "training_progress_status_check");
    t.timestamp("completed_at").nullable();
    t.timestamps(true, true);

    t.unique(["user_id", "chapter_id"], { indexName: "training_progress_user_chapter_uniq" });
    t.index(["user_id", "program_id"], "training_progress_user_program_idx");
  });

  await knex.schema.createTable("training_assessment_attempts", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();
    t.integer("user_id").unsigned().notNullable()
      .references("id").inTable("platform_users").onDelete("CASCADE");
    t.integer("assessment_id").unsigned().notNullable()
      .references("id").inTable("training_assessments").onDelete("CASCADE");
    t.integer("program_id").unsigned().notNullable()
      .references("id").inTable("training_programs").onDelete("CASCADE");
    // The learner's chosen answers only — the correct ones stay in the assessment.
    t.jsonb("answers").notNullable().defaultTo("{}");
    t.integer("score").notNullable();
    t.boolean("passed").notNullable();
    t.timestamp("attempted_at").notNullable().defaultTo(knex.fn.now());

    t.index(["user_id", "program_id"], "training_attempts_user_program_idx");
    t.check("score BETWEEN 0 AND 100", [], "training_attempts_score_check");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("training_assessment_attempts");
  await knex.schema.dropTableIfExists("training_progress");
  await knex.schema.dropTableIfExists("training_assignments");
}
