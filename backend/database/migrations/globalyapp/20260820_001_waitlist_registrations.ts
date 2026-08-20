import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("waitlist_registrations", (t) => {
    t.increments("id").primary();
    t.uuid("uuid").unique().notNullable().defaultTo(knex.raw("gen_random_uuid()"));
    t.text("name").notNullable();
    t.text("email").notNullable();
    t.text("registrant_type").notNullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // Same email may sign up under more than one registrant_type (e.g. a
  // person who is both a student and runs an institution) — only an exact
  // repeat of the same (email, registrant_type) pair is rejected.
  await knex.raw(`
    ALTER TABLE waitlist_registrations
      ADD CONSTRAINT waitlist_registrations_email_type_unique UNIQUE (email, registrant_type),
      ADD CONSTRAINT waitlist_registrations_registrant_type_check CHECK (
        registrant_type IN ('student', 'institution', 'service_provider', 'other')
      )
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("waitlist_registrations");
}
