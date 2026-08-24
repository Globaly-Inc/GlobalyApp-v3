import type { Knex } from "knex";

// Edit and delete on a chat message — GlobalyOS V2's message overflow menu, where the
// sender (and only the sender) gets Edit and Delete below the copy/forward actions.
//
// `deleted_at`, not a hard DELETE. V2's dialog says "permanently deleted", but an enquiry
// thread is the record of what a business and a student agreed, and it is referenced by
// stars, pins, reactions and replies. A soft delete looks identical to the person doing
// it — the row leaves every read — while keeping the history intact for a dispute and
// leaving the child rows' foreign keys valid.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("enquiry_messages", (t) => {
    // Null means never edited. The UI shows V2's "(edited)" marker when it is set.
    t.timestamp("edited_at", { useTz: true }).nullable();
    t.timestamp("deleted_at", { useTz: true }).nullable();
  });

  // Every read of a thread now filters on deleted_at, so it joins the existing
  // (distribution_id, created_at) access path.
  await knex.raw(`
    CREATE INDEX idx_enquiry_messages_live
      ON enquiry_messages (distribution_id, created_at)
      WHERE deleted_at IS NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP INDEX IF EXISTS idx_enquiry_messages_live");
  await knex.schema.alterTable("enquiry_messages", (t) => {
    t.dropColumn("deleted_at");
    t.dropColumn("edited_at");
  });
}
