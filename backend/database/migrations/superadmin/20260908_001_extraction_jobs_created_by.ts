import type { Knex } from "knex";

const S = "superadmin";

// created_by: who started this extraction. Nullable because the AgentCIS workers mint jobs
// with no logged-in user behind them; the admin-triggered paths (createJob,
// extractFromAggregator) always carry the caller's platform user id.
//
// updated_by: the last admin to act on the job row — pause/resume/decline/fail, context
// edits, rerun, reset-pipeline, deep-scrape. Pipeline writes (heartbeats, page counters,
// status advances from the workers) go through other queries and deliberately leave it
// alone, so this column stays an admin-action trail rather than worker noise.
//
// ON DELETE SET NULL on both — losing an admin's account must not take the extraction with it.
const COLUMNS = ["created_by_platform_user_id", "updated_by_platform_user_id"];

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(S).alterTable("extraction_jobs", (t) => {
    for (const column of COLUMNS) {
      t.integer(column).nullable()
        .references("id").inTable("public.platform_users").onDelete("SET NULL");
    }
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema(S).alterTable("extraction_jobs", (t) => {
    t.dropColumns(...COLUMNS);
  });
}
