// Whether the institution is a public or private institution — a distinct concept from
// extraction_site_intelligence.institution_type (university/college/tafe/...), which is the
// educational category, not ownership.

import type { Knex } from "knex";

const S = "superadmin";
const TABLE = "extraction_institution_overview";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(S).alterTable(TABLE, (t) => {
    t.text("ownership_type").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema(S).alterTable(TABLE, (t) => {
    t.dropColumn("ownership_type");
  });
}
