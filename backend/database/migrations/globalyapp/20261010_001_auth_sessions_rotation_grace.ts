// The token a session rotated away from, and when. Two tabs (or web. and app.) refreshing at
// the same moment send the same httpOnly cookie; the loser used to look like a stolen token
// replay and wiped every session. /refresh now accepts the previous token for a short grace
// window (REFRESH_REUSE_GRACE_MS in auth.service.ts) without rotating again. Nullable: a session
// that never rotated has no previous token.

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("auth_sessions", (t) => {
    t.string("previous_refresh_token_hash").nullable().index();
    t.timestamp("rotated_at", { useTz: true }).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("auth_sessions", (t) => {
    t.dropColumn("previous_refresh_token_hash");
    t.dropColumn("rotated_at");
  });
}
