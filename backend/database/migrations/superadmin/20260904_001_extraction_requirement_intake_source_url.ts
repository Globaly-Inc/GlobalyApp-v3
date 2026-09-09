// Provenance for the two child tables most likely to be wrong.
//
// extraction_eligibility_requirements and extraction_intakes had no source_url at all, so
// "which page said this?" was unanswerable for exactly the data that drifts most and that a
// reviewer most often disputes — an entry requirement or an intake date. Its absence also kept
// these rows out of the save-and-learn memory trail, which forwards source_url when the row
// carries one (editable-field.tsx), and left the verify worker unable to re-check them.
//
// extraction_english_requirements already has the column; only the writers were skipping it.

import type { Knex } from "knex";

const S = "superadmin";
const TABLES = ["extraction_eligibility_requirements", "extraction_intakes"] as const;

export async function up(knex: Knex): Promise<void> {
  for (const table of TABLES) {
    await knex.schema.withSchema(S).alterTable(table, (t) => {
      t.text("source_url").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  for (const table of TABLES) {
    await knex.schema.withSchema(S).alterTable(table, (t) => {
      t.dropColumn("source_url");
    });
  }
}
