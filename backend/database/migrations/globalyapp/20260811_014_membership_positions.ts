import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("user_business_index", (t) => {
    t.text("position").nullable();
    t.timestamp("position_updated_at", { useTz: true }).nullable();
  });

  await knex.schema.alterTable("platform_user_work_experiences", (t) => {
    t.integer("source_membership_id").unsigned().nullable().references("id").inTable("user_business_index").onDelete("SET NULL");
    // Snapshot of the position at confirmation time. A later change to the membership position no longer
    // matches this, which is how "position changed" is detected after a first-time confirmation.
    t.text("confirmed_position").nullable();
  });

  await knex.raw(`
    CREATE UNIQUE INDEX work_exp_source_membership_uniq
      ON platform_user_work_experiences (source_membership_id)
      WHERE source_membership_id IS NOT NULL AND deleted_at IS NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP INDEX IF EXISTS work_exp_source_membership_uniq");
  await knex.schema.alterTable("platform_user_work_experiences", (t) => {
    t.dropColumn("confirmed_position");
    t.dropColumn("source_membership_id");
  });
  await knex.schema.alterTable("user_business_index", (t) => {
    t.dropColumn("position_updated_at");
    t.dropColumn("position");
  });
}
