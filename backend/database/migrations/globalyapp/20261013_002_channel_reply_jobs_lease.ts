import type { Knex } from "knex";

// A reply job is LEASED while the worker answers it, not deleted up front (20261013_001 claimed by
// deleting): a worker that dies mid-reply used to lose the reply for good, since the inbound event
// was already processed. Now the lease runs out and another poll answers it.
//
//   claimed_until  a worker is answering until then; past it the job is claimable again
//   version        bumped by every new customer message, so finishing a reply deletes the job only
//                  if nothing arrived meanwhile — a newer message keeps its own pending reply
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE channel_reply_jobs
      ADD COLUMN claimed_until timestamptz,
      ADD COLUMN version integer NOT NULL DEFAULT 0;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE channel_reply_jobs
      DROP COLUMN IF EXISTS claimed_until,
      DROP COLUMN IF EXISTS version;
  `);
}
