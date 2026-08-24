import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("ambassadors", (t) => {
    t.increments("id").primary();
    t.integer("program_id").unsigned().notNullable()
      .references("id").inTable("ambassador_programs").onDelete("CASCADE");
    t.integer("user_id").unsigned().notNullable().references("id").inTable("platform_users").onDelete("CASCADE");
    t.integer("application_id").unsigned().notNullable().unique()
      .references("id").inTable("ambassador_applications").onDelete("RESTRICT");
    t.text("referral_code").notNullable();
    t.text("status").notNullable().defaultTo("active");
    // Populated once Stripe Connect onboarding lands (next step) — nullable until then.
    t.text("stripe_connect_account_id").nullable();
    t.text("connect_onboarding_status").notNullable().defaultTo("not_started");
    t.timestamps(true, true);
  });

  await knex.raw(`ALTER TABLE ambassadors ADD CONSTRAINT chk_amb_status CHECK (status IN ('active', 'suspended'))`);
  await knex.raw(
    `ALTER TABLE ambassadors ADD CONSTRAINT chk_amb_connect_status
       CHECK (connect_onboarding_status IN ('not_started', 'pending', 'complete'))`,
  );
  await knex.raw(`CREATE UNIQUE INDEX idx_ambassadors_code_lower ON ambassadors (lower(referral_code))`);
  await knex.raw(`CREATE INDEX idx_ambassadors_program ON ambassadors (program_id)`);
  // One ambassador seat per person per program — mirrors the applications uniqueness one level up.
  await knex.raw(`CREATE UNIQUE INDEX idx_ambassadors_program_user ON ambassadors (program_id, user_id)`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("ambassadors");
}
