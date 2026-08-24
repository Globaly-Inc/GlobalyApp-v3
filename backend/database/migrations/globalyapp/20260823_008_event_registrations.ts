import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("event_registrations", (t) => {
    t.increments("id").primary();
    t.integer("event_id").unsigned().notNullable().references("id").inTable("events").onDelete("CASCADE");
    t.integer("user_id").unsigned().notNullable().references("id").inTable("platform_users").onDelete("CASCADE");
    t.text("status").notNullable().defaultTo("registered");
    t.timestamps(true, true);
  });

  await knex.raw(
    `ALTER TABLE event_registrations ADD CONSTRAINT chk_er_status CHECK (status IN ('registered', 'cancelled'))`,
  );
  await knex.raw(`CREATE UNIQUE INDEX idx_event_registrations_unique ON event_registrations (event_id, user_id)`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("event_registrations");
}
