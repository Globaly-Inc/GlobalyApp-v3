import type { Knex } from "knex";

// A real `status` column on ai_widget_visitors, holding 'visitor' or 'lead'.
//
// GENERATED ALWAYS ... STORED rather than an ordinary column the app writes, and the difference
// is the whole point of doing it this way:
//
//   - It cannot drift. `ai_widget_visitors` has several writers (resolveVisitor, recordContact,
//     recordTurn, recordConversationEnd, plus the chat-summary worker) and every one of them
//     would otherwise have to remember to keep status in step with name/email. One that forgets
//     produces a row filed under the wrong tab with nothing erroring anywhere.
//   - It needs no backfill, now or ever. Postgres computes it for every existing row as part of
//     this ALTER, and for every future row on write.
//   - It cannot be set by hand, which is what the feature asked for: the classification follows
//     the stored visitor data and is never picked in the UI.
//
// The rule is exactly the one the read side used before this column existed, so the tabs and the
// Status column cannot disagree: a visitor becomes a lead the moment they hand over their
// details. Testing `email` alone is sufficient because chk_ai_widget_visitors_contact_pair
// already guarantees `(name IS NULL) = (email IS NULL)` — half a contact cannot be stored.
//
// CAST(... AS text) and not `::text`: knex.raw parses `:name` as a binding placeholder, so a
// colon cast in a migration string is silently rewritten and ships broken SQL.
//
// Same file in institution/20260923_001 — an institution's widget works identically and its
// visitors live in its own schema. Twin migrations, as with ai_widget_visitors itself.
//
// Note this ALTER rewrites the table (a stored generated column always does). These are small,
// per-tenant tables, so that is seconds, but it is a lock, not a metadata-only change.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE ai_widget_visitors
      ADD COLUMN status text
      GENERATED ALWAYS AS (
        CASE WHEN email IS NULL THEN CAST('visitor' AS text) ELSE CAST('lead' AS text) END
      ) STORED
  `);

  // Columns in the order the list reads them: filter by status, then newest activity first.
  await knex.raw(`
    CREATE INDEX ai_widget_visitors_status_idx
      ON ai_widget_visitors (status, last_activity_at DESC)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS ai_widget_visitors_status_idx`);
  await knex.raw(`ALTER TABLE ai_widget_visitors DROP COLUMN IF EXISTS status`);
}
