// Waitlist — V2's `waitlist_registrations` (waitlist.ts). MASTER schema.
//
// PLACEMENT (§1.2). A pre-launch sign-up belongs to the platform, not to any
// business and not to superadmin's staging/audit tier. It also predates the signer
// having a `platform_users` row at all, so there is deliberately no FK: a waitlist
// row is a contact capture, not an account.
//
// THIS TABLE IS NOTHING BUT PII. Every column except the id is personal data
// (email, name, self-declared type). Two consequences the routes must honour, and
// which tests assert rather than trust:
//   1. There is no unauthenticated read. The public surface is POST-only, and its
//      response body carries no column from this table — not even an echo of the
//      submitted email.
//   2. The admin read names its columns explicitly. No `select *`, no bare
//      `.first()` — the two leak shapes already caught in this program.
//
// EMAIL IS STORED FOLDED, AND THE DATABASE ENFORCES IT
// The unique index is case-sensitive, so "A@x.com" and "a@x.com" would both insert
// and the "already registered" branch would silently stop working. V2 folded case in
// the route and left the table free to disagree with it. The CHECK makes the
// invariant the table's own, so a seeder, a loader or a future writer cannot break
// idempotency by forgetting.

import type { Knex } from "knex";

/** V2's `registrant_type` vocabulary, verbatim. Closed set — a new one is a product decision. */
const REGISTRANT_TYPES = ["student", "institution", "service_provider", "other"] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("waitlist_registrations", (t) => {
    t.increments("id").primary();
    // Folded to lower case before insert; the CHECK below is what guarantees it.
    t.text("email").notNullable().unique();
    t.text("name").notNullable();
    t.text("registrant_type").notNullable()
      .checkIn([...REGISTRANT_TYPES], "waitlist_registrations_type_check");
    t.timestamps(true, true);

    // Admin listing is newest-first over the whole table.
    t.index(["created_at"], "waitlist_registrations_created_idx");
  });

  await knex.raw(`
    ALTER TABLE waitlist_registrations
      ADD CONSTRAINT waitlist_registrations_email_lowercase_check
      CHECK (email = lower(email))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("waitlist_registrations");
}
