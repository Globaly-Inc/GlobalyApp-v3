import type { Knex } from "knex";

/**
 * The eligibility verdict computed at submission time, stored whole.
 *
 * A snapshot, not a live view — the same reasoning as `enquiries.student_latitude`: the student
 * can edit their profile afterwards, and a verdict a business paid to unlock must not silently
 * change underneath it.
 *
 * One jsonb column rather than a column per criterion: the criteria list varies by course, and
 * the rollup stays queryable as `eligibility_snapshot->>'status'`. NULL means "not evaluated"
 * (every enquiry created before this shipped) and must never render as ineligible.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("enquiries", (t) => {
    t.jsonb("eligibility_snapshot").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("enquiries", (t) => {
    t.dropColumn("eligibility_snapshot");
  });
}
