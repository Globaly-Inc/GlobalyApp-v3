import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("ambassador_programs", (t) => {
    t.increments("id").primary();
    t.integer("business_id").unsigned().notNullable().references("id").inTable("businesses").onDelete("CASCADE");
    t.text("name").notNullable();
    t.text("description").nullable();
    t.text("commission_type").notNullable();
    t.decimal("commission_value", 10, 2).notNullable();
    t.text("currency").notNullable().defaultTo("USD");
    t.text("status").notNullable().defaultTo("draft");
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
  });

  await knex.raw(
    `ALTER TABLE ambassador_programs ADD CONSTRAINT chk_ap_commission_type CHECK (commission_type IN ('flat', 'percentage'))`,
  );
  await knex.raw(
    `ALTER TABLE ambassador_programs ADD CONSTRAINT chk_ap_status CHECK (status IN ('draft', 'active', 'paused', 'closed'))`,
  );
  await knex.raw(`CREATE INDEX idx_ambassador_programs_business ON ambassador_programs (business_id)`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("ambassador_programs");
}
