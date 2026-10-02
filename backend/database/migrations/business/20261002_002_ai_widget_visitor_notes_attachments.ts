import type { Knex } from "knex";

// Files on internal notes, the same shape enquiry chat stores ({ storage_path, original_name,
// mime_type, size_bytes }); view URLs are signed per read, never stored.
//
// Twin of institution/20261002_002 — same columns, different schema.
//
// A note may now be files only, so the 1..4000 length CHECK becomes "at most 4000, and text or
// at least one file". The old constraint was unnamed in 20261002_001, so Postgres named it
// ai_widget_visitor_notes_content_check.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE ai_widget_visitor_notes
      ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]',
      DROP CONSTRAINT IF EXISTS ai_widget_visitor_notes_content_check,
      ADD CONSTRAINT ai_widget_visitor_notes_content_check
        CHECK (char_length(content) <= 4000 AND (char_length(content) > 0 OR jsonb_array_length(attachments) > 0))
  `);
}

// Destructive: file-only notes can't satisfy the old CHECK, so they are removed first.
export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DELETE FROM ai_widget_visitor_notes WHERE char_length(content) = 0`);
  await knex.raw(`
    ALTER TABLE ai_widget_visitor_notes
      DROP CONSTRAINT IF EXISTS ai_widget_visitor_notes_content_check,
      DROP COLUMN IF EXISTS attachments,
      ADD CONSTRAINT ai_widget_visitor_notes_content_check CHECK (char_length(content) BETWEEN 1 AND 4000)
  `);
}
