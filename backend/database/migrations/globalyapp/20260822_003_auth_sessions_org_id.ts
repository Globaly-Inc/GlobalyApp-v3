import type { Knex } from "knex";

// Business accounts used to have exactly one business, so login/refresh could always sign the
// token for `businesses[0]` with no memory needed. Now that one platform_user can own several,
// that same "always businesses[0]" logic on /refresh was silently reverting a user's switch the
// next time their access token refreshed. This column lets a session remember which business it
// last switched to, so /refresh can honor it instead of resetting to the default every time.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("auth_sessions", (t) => {
    t.text("org_id").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("auth_sessions", (t) => {
    t.dropColumn("org_id");
  });
}
