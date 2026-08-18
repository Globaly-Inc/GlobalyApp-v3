// Training programs, chapters and the final assessment. Wave G4.
//
// Spec: V2 `training_programs` / `training_chapters` / `training_assessments`
// (routes/business-training.ts's column maps, routes/training.ts's reads).
//
// NOTE for the reader coming from the master plan: V2's `courses.ts` is NOT part
// of this feature. It serves the public course catalogue over `business_services`
// — already built in V3's catalog/search modules. Training is its own tree.
//
// Master (`public`) tier: a training program is owned by a business but assigned
// to individual platform users (agents, ambassadors, students) who are not
// tenants of that business's schema, and certificates are verified publicly.
//
// `questions` holds the correct answers. It is never projected to a learner —
// the learner-facing read strips `correct_index` in code (see
// training.service.ts `publicAssessment`), and grading reads this column
// server-side so a student can never self-certify.

import type { Knex } from "knex";

const TARGET_AUDIENCES = ["agents", "ambassadors", "students"] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("training_programs", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();

    t.integer("business_id").unsigned().notNullable()
      .references("id").inTable("businesses").onDelete("CASCADE");
    t.integer("created_by").unsigned().nullable()
      .references("id").inTable("platform_users").onDelete("SET NULL");

    t.text("title").notNullable();
    t.text("description").nullable();
    t.text("category").nullable();
    t.text("target_audience").notNullable().defaultTo("students")
      .checkIn([...TARGET_AUDIENCES], "training_programs_target_audience_check");
    t.text("thumbnail_url").nullable();

    t.boolean("is_mandatory").notNullable().defaultTo(false);
    t.timestamp("due_date").nullable();
    t.boolean("auto_close").notNullable().defaultTo(false);

    // Certificate policy.
    t.integer("certificate_expiry_months").nullable();
    t.jsonb("certificate_level_thresholds").notNullable()
      .defaultTo(JSON.stringify({ gold: 95, silver: 85, bronze: 70 }));

    t.integer("passing_score").notNullable().defaultTo(70);
    t.boolean("retake_allowed").notNullable().defaultTo(true);
    t.integer("max_attempts").nullable().defaultTo(3);
    t.boolean("is_published").notNullable().defaultTo(false);

    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();

    t.index(["business_id", "is_published"], "training_programs_business_published_idx");
    t.check("passing_score BETWEEN 1 AND 100", [], "training_programs_passing_score_check");
  });

  await knex.schema.createTable("training_chapters", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();
    t.integer("program_id").unsigned().notNullable()
      .references("id").inTable("training_programs").onDelete("CASCADE");
    t.text("title").notNullable();
    t.text("content_text").nullable();
    t.text("video_url").nullable();
    t.integer("sort_order").notNullable().defaultTo(0);
    t.timestamps(true, true);

    t.index(["program_id", "sort_order"], "training_chapters_program_sort_idx");
  });

  await knex.schema.createTable("training_assessments", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();
    // V2 models exactly one final assessment per program (PUT, not POST).
    t.integer("program_id").unsigned().notNullable().unique()
      .references("id").inTable("training_programs").onDelete("CASCADE");
    t.integer("chapter_id").unsigned().nullable()
      .references("id").inTable("training_chapters").onDelete("SET NULL");
    t.text("title").notNullable().defaultTo("Final assessment");
    // [{ question, options: string[], correct_index: number, explanation? }]
    t.jsonb("questions").notNullable().defaultTo("[]");
    t.integer("passing_score").notNullable().defaultTo(70);
    t.timestamps(true, true);

    t.check("passing_score BETWEEN 1 AND 100", [], "training_assessments_passing_score_check");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("training_assessments");
  await knex.schema.dropTableIfExists("training_chapters");
  await knex.schema.dropTableIfExists("training_programs");
}
