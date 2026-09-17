// Fee rows arrive with the whole page blob as their name ("$1,090 per credit 33 total credits
// $35,970 total cost"). `name` is now a short label ("Semester Fee") and the page's verbatim
// wording lives in `description`.
//
// Existing rows are rewritten by scripts/normalise-course-fees.ts (npm run fees:normalise),
// which also folds the currency/period_type drift — data, not schema, so it does not belong here.

import type { Knex } from "knex";

const S = "superadmin";
const TABLE = "extraction_course_fees";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(S).alterTable(TABLE, (t) => {
    t.text("description").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema(S).alterTable(TABLE, (t) => {
    t.dropColumn("description");
  });
}
