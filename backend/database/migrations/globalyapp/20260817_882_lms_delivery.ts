// LMS delivery: assignment submissions, per-chapter quizzes, and the lesson
// definition that makes both of them authorable. Wave E4.
//
// This is the gap Wave G4 named and left: G4 built programmes, chapters, the
// final assessment, enrolment, progress, certificates and gamification, but not
// the per-lesson tasks a learner hands in. Master tier, alongside the rest of the
// training family (see 20260817_604's placement note) — a programme is owned by a
// business but done by platform users from anywhere.
//
// ── training_chapters.attachments ──
// V1 kept an assignment's brief, accepted file types, due date and named reviewer
// in this JSONB blob and parsed it ONLY in the browser
// (StudentLMSProgram.tsx parseChapter), so nothing server-side ever validated
// against it. V2 then omitted the column from both its chapter GET projection and
// its chapter PUT body — which means V2 has no way to author an assignment or a
// quiz lesson at all (defect D-E4-1). The column is added here and is read
// server-side: the quiz grader takes its questions from it, and the learner
// projection strips the answers out.
//
// Shape:
//   { assignment?: { instruction, accepted_types?: string[], due_date?: ISO },
//     quiz?: { passing_score: number,
//              questions: [{ question, options: string[], correct_index, explanation? }] } }
//
// ── lms_assignment_submissions ──
// V2's table verbatim (`0000_init.sql:2301`), plus two things it lacked:
//
//  * `attempt_number` + UNIQUE (user_id, chapter_id, attempt_number). V2 had NO
//    unique key at all, always INSERTed, and nothing linked a revision to the
//    submission it revised — so `needs_revision` was a status the API could set
//    and no client could act on, while the grading queue grew one unbounded row
//    per retry (defect D-E4-2). The counter is server-computed; a client cannot
//    supply it.
//  * a CHECK on `status`. It was bare `text` in both codebases and had already
//    forked into two incompatible vocabularies: the grader wrote
//    needs_revision/passed/failed while the learner UI only understood
//    submitted/reviewed/approved/rejected, so every graded submission displayed
//    as "awaiting review" for ever (defect D-E4-3). One CHECK ends that.
//
// ── lms_quiz_submissions ──
// V2 took `score` and `passed` from the request body and wrote them verbatim,
// documenting it as a faithful port of V1's client-side scoring. That is a
// learner grading themselves (defect D-E4-4). Here the columns exist but the
// service computes them from the chapter's own answer key, exactly as G4's
// final-assessment grader does — `attempts` carries only the learner's choices.

import type { Knex } from "knex";

const SUBMISSION_STATUSES = ["submitted", "needs_revision", "passed", "failed"] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("training_chapters", (t) => {
    t.jsonb("attachments").notNullable().defaultTo("{}");
  });

  await knex.schema.createTable("lms_assignment_submissions", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();

    t.integer("user_id").unsigned().notNullable()
      .references("id").inTable("platform_users").onDelete("CASCADE");
    t.integer("chapter_id").unsigned().notNullable()
      .references("id").inTable("training_chapters").onDelete("CASCADE");
    // Denormalised so the business's grading queue is one indexed query. The
    // service asserts the chapter really belongs to this programme before
    // inserting — V2 accepted any (program_id, chapter_id) pair from the body and
    // injected rows into other businesses' queues (defect D-E4-5).
    t.integer("program_id").unsigned().notNullable()
      .references("id").inTable("training_programs").onDelete("CASCADE");

    t.text("submission_text").nullable();
    t.text("file_url").nullable();
    t.text("file_name").nullable();

    t.text("status").notNullable().defaultTo("submitted")
      .checkIn([...SUBMISSION_STATUSES], "lms_assignment_submissions_status_check");
    t.text("feedback").nullable();

    t.integer("attempt_number").notNullable().defaultTo(1);

    t.timestamp("submitted_at").notNullable().defaultTo(knex.fn.now());
    t.timestamp("reviewed_at").nullable();
    t.integer("reviewer_id").unsigned().nullable()
      .references("id").inTable("platform_users").onDelete("SET NULL");

    t.unique(["user_id", "chapter_id", "attempt_number"], {
      indexName: "lms_assignment_submissions_attempt_uniq",
    });
    t.index(["program_id", "status"], "lms_assignment_submissions_program_status_idx");
    t.index(["user_id", "program_id"], "lms_assignment_submissions_user_program_idx");
    t.index(["chapter_id"], "lms_assignment_submissions_chapter_idx");

    // Something has to be handed in. V2 required neither text nor file, so an
    // empty submission was a legal row in the grading queue.
    t.check(
      "submission_text IS NOT NULL OR file_url IS NOT NULL",
      [],
      "lms_assignment_submissions_content_check",
    );
    t.check("attempt_number >= 1", [], "lms_assignment_submissions_attempt_check");
    // A graded submission carries its reviewer and its verdict together.
    t.check(
      "(status = 'submitted') = (reviewed_at IS NULL)",
      [],
      "lms_assignment_submissions_reviewed_consistency_check",
    );
  });

  await knex.schema.createTable("lms_quiz_submissions", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();

    t.integer("user_id").unsigned().notNullable()
      .references("id").inTable("platform_users").onDelete("CASCADE");
    t.integer("program_id").unsigned().notNullable()
      .references("id").inTable("training_programs").onDelete("CASCADE");
    t.integer("chapter_id").unsigned().notNullable()
      .references("id").inTable("training_chapters").onDelete("CASCADE");

    /** The learner's choices only — the answer key stays in the chapter. */
    t.jsonb("answers").notNullable().defaultTo("{}");
    t.integer("score").notNullable();
    t.boolean("passed").notNullable();
    t.integer("attempt_number").notNullable();
    t.timestamp("submitted_at").notNullable().defaultTo(knex.fn.now());

    t.unique(["user_id", "chapter_id", "attempt_number"], {
      indexName: "lms_quiz_submissions_attempt_uniq",
    });
    t.index(["user_id", "program_id"], "lms_quiz_submissions_user_program_idx");
    t.check("score BETWEEN 0 AND 100", [], "lms_quiz_submissions_score_check");
    t.check("attempt_number >= 1", [], "lms_quiz_submissions_attempt_check");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("lms_quiz_submissions");
  await knex.schema.dropTableIfExists("lms_assignment_submissions");
  await knex.schema.alterTable("training_chapters", (t) => {
    t.dropColumn("attachments");
  });
}
