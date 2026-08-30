import type { Knex } from "knex";

// The footer newsletter form reuses waitlist_registrations with a new
// registrant_type. Zod's REGISTRANT_TYPES already includes it; this widens the
// DB check to match (the check is the second gate — keep both in sync).
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE waitlist_registrations
      DROP CONSTRAINT waitlist_registrations_registrant_type_check,
      ADD CONSTRAINT waitlist_registrations_registrant_type_check CHECK (
        registrant_type IN ('student', 'institution', 'service_provider', 'other', 'newsletter')
      )
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE waitlist_registrations
      DROP CONSTRAINT waitlist_registrations_registrant_type_check,
      ADD CONSTRAINT waitlist_registrations_registrant_type_check CHECK (
        registrant_type IN ('student', 'institution', 'service_provider', 'other')
      )
  `);
}
