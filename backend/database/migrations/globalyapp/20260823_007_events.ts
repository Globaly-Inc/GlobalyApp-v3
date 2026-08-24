import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("events", (t) => {
    t.increments("id").primary();
    t.integer("business_id").unsigned().notNullable().references("id").inTable("businesses").onDelete("CASCADE");
    t.text("title").notNullable();
    t.text("description").nullable();
    t.timestamp("start_at").notNullable();
    t.timestamp("end_at").nullable();
    t.boolean("is_online").notNullable().defaultTo(false);
    t.text("location").nullable();
    t.text("meeting_url").nullable();
    t.integer("capacity").nullable();
    t.text("status").notNullable().defaultTo("draft");
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
  });

  await knex.raw(`ALTER TABLE events ADD CONSTRAINT chk_events_status CHECK (status IN ('draft', 'published', 'cancelled'))`);
  await knex.raw(`CREATE INDEX idx_events_business ON events (business_id)`);
  await knex.raw(`CREATE INDEX idx_events_start_at ON events (start_at)`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("events");
}
