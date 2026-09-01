import type { Knex } from "knex";

/**
 * Three columns that turn a distribution into a Space you can actually manage: whether the student
 * walked away from it, what it is called, and what it looks like.
 *
 * All on `enquiry_distributions` because that row IS the thread — there is no conversations table in
 * this system (see 20260819_001_enquiry_messages) — and all on the DISTRIBUTION rather than the
 * enquiry because one enquiry fans out to several unlockers. Leaving one agency's conversation, or
 * renaming it, must not touch the others.
 *
 * `student_left_at` — business members leave by deleting their `enquiry_thread_members` row. The
 *   student holds no such row: their membership is `enquiries.student_id` and always has been (see
 *   20260901_001), so there is nothing to delete and a timestamp is what is left. Deliberately NOT
 *   a soft delete of the distribution — `deleted_at` would hide the thread from the business too,
 *   and the business keeps the lead it paid for whether or not the student is still reading.
 *
 * `title` — a name the thread's admin gave it, replacing the default for EVERYONE on it, the
 *   student included. Until now a thread had no name of its own: each side rendered the other
 *   party, so the business saw the student and the student saw the agency. Two labels for one
 *   conversation is fine while it is nameless and wrong the moment someone names it.
 *
 * `photo_url` — the same idea for the picture. A STORAGE PATH, not a URL, like
 *   platform_users.photo_url and businesses.logo_url: enquiry media lives under `private/` and is
 *   only reachable through a short-lived signed URL, so a stored URL would be expired by the time
 *   anyone read it. The services sign it per read.
 *
 * All three nullable, and cleared back to NULL rather than to '': null is what makes each side fall
 * back to its own default — its own label, its own avatar. An empty string would be a name that
 * renders as nothing.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("enquiry_distributions", (t) => {
    t.timestamp("student_left_at", { useTz: true }).nullable();
    t.text("title").nullable();
    t.text("photo_url").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("enquiry_distributions", (t) => {
    t.dropColumn("student_left_at");
    t.dropColumn("title");
    t.dropColumn("photo_url");
  });
}
