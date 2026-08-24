import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("ad_campaigns", (t) => {
    t.increments("id").primary();
    t.integer("business_id").unsigned().notNullable().references("id").inTable("businesses").onDelete("CASCADE");
    t.text("title").notNullable();
    t.text("description").nullable();
    t.text("image_url").nullable();
    t.text("target_url").nullable();
    t.integer("budget_minor").notNullable();
    t.text("currency").notNullable().defaultTo("USD");
    t.timestamp("start_at").notNullable();
    t.timestamp("end_at").nullable();
    t.text("status").notNullable().defaultTo("draft");
    t.integer("impressions").notNullable().defaultTo(0);
    t.integer("clicks").notNullable().defaultTo(0);
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
  });

  await knex.raw(
    `ALTER TABLE ad_campaigns ADD CONSTRAINT chk_ac_status CHECK (status IN ('draft', 'active', 'paused', 'completed'))`,
  );
  await knex.raw(`CREATE INDEX idx_ad_campaigns_business ON ad_campaigns (business_id)`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("ad_campaigns");
}
