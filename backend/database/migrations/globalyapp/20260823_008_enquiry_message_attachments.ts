import type { Knex } from "knex";

// Attachments on an enquiry chat message — GlobalyOS V2's `chat_attachments`, and the
// "Upload file / image / video" menu in its composer.
//
// A JSONB column, not a child table, because the upload happens BEFORE the message
// exists: the client uploads, gets a storage_path back, then sends it with the message
// (V2's flow, and `feed_posts.media` in this repo already does exactly this). A child
// table would need the message id at upload time, which nothing has yet.
//
// The bytes live in GCS and the row in `uploaded_files` — the same storageService +
// files.repository path every other upload here uses. This column only holds the
// reference, so there is no second source of truth for file metadata.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("enquiry_messages", (t) => {
    // Array of { storage_path, original_name, mime_type, size_bytes }. NULL, not '[]',
    // for a plain text message — the overwhelming majority of rows.
    t.jsonb("attachments").nullable();
  });

  // The body check has to be relaxed: an attachment-only message is legitimate (V2 lets
  // you send a file with no caption), and the original constraint rejected empty text
  // unconditionally. Whitespace-only is still not a message when nothing is attached.
  await knex.raw("ALTER TABLE enquiry_messages DROP CONSTRAINT IF EXISTS enquiry_messages_body_chk");
  await knex.raw(`
    ALTER TABLE enquiry_messages
      ADD CONSTRAINT enquiry_messages_body_chk
      CHECK (btrim(body) <> '' OR jsonb_array_length(coalesce(attachments, '[]'::jsonb)) > 0)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("ALTER TABLE enquiry_messages DROP CONSTRAINT IF EXISTS enquiry_messages_body_chk");
  // Attachment-only rows would violate the restored constraint, so they go first.
  await knex.raw(`
    DELETE FROM enquiry_messages
     WHERE btrim(body) = ''
       AND jsonb_array_length(coalesce(attachments, '[]'::jsonb)) > 0
  `);
  await knex.raw(`
    ALTER TABLE enquiry_messages
      ADD CONSTRAINT enquiry_messages_body_chk CHECK (btrim(body) <> '')
  `);
  await knex.schema.alterTable("enquiry_messages", (t) => {
    t.dropColumn("attachments");
  });
}
