// Admin-authored dates an intake carries beyond the four fixed ones: exam date, English test
// date, scholarship deadline, document submission deadline, vacation…
//
// jsonb rather than columns or a child table, for the reason the shape is open-ended: the set of
// names is unbounded and institution-specific, so every alternative means either a migration per
// new kind of date or a table whose rows are only ever read as one list belonging to one intake.
// Same call, same shape and same default as `extraction_course_fees.installments` and
// `extraction_eligibility_requirements.academic_tests` — `[{ name, date }]`, with `date` a
// "YYYY-MM-DD" string.
//
// NOT NULL DEFAULT '[]' so every read gets an array without a null check, matching those two.
//
// Note these dates ride on a SHARED intake row (see CLAUDE.md (g) — one "Semester 1 2027" is
// linked to every course offering it), exactly as start_date and admission_deadline already do.
// A custom date added here shows on every course linked to that intake, which is the intended
// meaning: it is a fact about the intake, not about one course.

import type { Knex } from "knex";

const S = "superadmin";
const TABLE = "extraction_intakes";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(S).alterTable(TABLE, (t) => {
    t.jsonb("custom_dates").notNullable().defaultTo("[]");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema(S).alterTable(TABLE, (t) => {
    t.dropColumn("custom_dates");
  });
}
