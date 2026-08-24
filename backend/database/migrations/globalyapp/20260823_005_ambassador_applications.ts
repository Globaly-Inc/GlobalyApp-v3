import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("ambassador_applications", (t) => {
    t.increments("id").primary();
    t.integer("program_id").unsigned().notNullable()
      .references("id").inTable("ambassador_programs").onDelete("CASCADE");
    t.integer("applicant_user_id").unsigned().notNullable()
      .references("id").inTable("platform_users").onDelete("CASCADE");
    t.text("status").notNullable().defaultTo("pending");
    t.text("note").nullable();
    t.integer("reviewed_by").unsigned().nullable().references("id").inTable("platform_users");
    t.timestamp("reviewed_at").nullable();
    t.timestamps(true, true);
  });

  await knex.raw(
    `ALTER TABLE ambassador_applications ADD CONSTRAINT chk_aa_status CHECK (status IN ('pending', 'approved', 'rejected'))`,
  );
  // One live application per person per program — resubmission after a rejection is a product
  // decision for later, not something this constraint needs to allow yet.
  await knex.raw(
    `CREATE UNIQUE INDEX idx_ambassador_applications_unique ON ambassador_applications (program_id, applicant_user_id)`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("ambassador_applications");
}
