import type { Knex } from "knex";

const S = "superadmin";

// Manual attribution on staged extraction rows.
//
// created_by: only tables with a manual-create endpoint. Null means the pipeline wrote the
// row — the workers have no signed-in user behind them, so null IS the "scraped, not
// hand-added" marker and no separate is_manual flag is needed.
//
// updated_by: every table editable from the job sub-tabs, which is the created_by set plus
// institution_overview and visa_services — both pipeline-created but hand-corrected, so a
// created_by on them would sit null forever while updated_by is the column that answers
// "who changed this field". Overwritten on each edit: last editor, not full history
// (extraction_memory already keeps the per-edit diff trail for save-and-learn).
//
// ON DELETE SET NULL on both — losing an admin account must not take the staged data with it.
const CREATED_BY_TABLES = [
  "extraction_courses",
  "extraction_course_fees",
  "extraction_study_units",
  "extraction_study_options",
  "extraction_intakes",
  "extraction_eligibility_requirements",
  "extraction_accreditations",
  "extraction_agents",
  "extraction_campuses",
];

const UPDATED_BY_TABLES = [
  ...CREATED_BY_TABLES,
  "extraction_institution_overview",
  "extraction_visa_services",
];

async function addUserColumn(knex: Knex, table: string, column: string) {
  await knex.schema.withSchema(S).alterTable(table, (t) => {
    t.integer(column).nullable()
      .references("id").inTable("public.platform_users").onDelete("SET NULL");
  });
}

export async function up(knex: Knex): Promise<void> {
  for (const table of CREATED_BY_TABLES) {
    await addUserColumn(knex, table, "created_by_platform_user_id");
  }
  for (const table of UPDATED_BY_TABLES) {
    await addUserColumn(knex, table, "updated_by_platform_user_id");
  }
}

export async function down(knex: Knex): Promise<void> {
  for (const table of UPDATED_BY_TABLES) {
    await knex.schema.withSchema(S).alterTable(table, (t) => {
      t.dropColumn("updated_by_platform_user_id");
    });
  }
  for (const table of CREATED_BY_TABLES) {
    await knex.schema.withSchema(S).alterTable(table, (t) => {
      t.dropColumn("created_by_platform_user_id");
    });
  }
}
