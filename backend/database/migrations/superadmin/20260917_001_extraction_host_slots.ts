import type { Knex } from "knex";

const S = "superadmin";

// Cross-process per-host request pacing.
//
// The in-process throttle in scraper.ts coordinates the page worker's auto-scaled consumers,
// which share one process. It cannot see the OTHER worker processes — extraction-job,
// extraction-step (the GCS snapshot, which walks the same URL list as the page worker) and
// extraction-verify are each their own `npm run job:*` process with their own Map. Against a
// university that publishes nearly every course on one catalogue host (Yale: 983 of 1,013 queued
// on catalog.yale.edu) that is 8x the intended rate — docker-compose runs EIGHT worker containers.
//
// Precautionary, and worth saying plainly: no target site has ever rate-limited or blocked this
// pipeline (1,490 recorded page errors, all our own infrastructure, zero 429/403/Cloudflare).
// This exists so one institution cannot ban the IP every institution is crawled from, not to fix
// an observed block. It FAILS OPEN — a missing table degrades to in-process pacing, silently.
//
// One row per host holding the next free slot. A reservation is a single upsert —
// `GREATEST(next_slot_at, now()) + gap` — so concurrent claimants serialise on the row lock and
// each gets a distinct time, exactly like the in-process version but shared by every process.
//
// Deliberately NOT a lock: a lock gives exclusion, not spacing. Deliberately not Redis either —
// ioredis is a dependency but no REDIS_* is configured in this deployment, and Postgres is
// already the one piece of shared state every worker has.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(S).createTable("extraction_host_slots", (t) => {
    t.text("host").primary();
    t.timestamp("next_slot_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  // Rows are tiny and self-maintaining (one per host ever scraped), so there is nothing to purge
  // on a schedule; a host not seen for months costs one row.
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema(S).dropTableIfExists("extraction_host_slots");
}
