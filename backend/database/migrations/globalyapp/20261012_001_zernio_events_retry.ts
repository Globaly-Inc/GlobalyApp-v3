import type { Knex } from "knex";

// Retrying failed Zernio webhook events without starving new ones.
//
//   attempts         how many times processing threw. 0 = never attempted (e.g. the queue publish
//                    failed): always eligible for the sweep, however old.
//   next_attempt_at  when a failed event may be tried again (exponential backoff). The sweep takes
//                    due events in due-time order, so a run of failures can't block newer work.
//
// After the last allowed attempt the event is marked processed with its error kept (see
// zernio.repository markEventFailed).
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE zernio_events
      ADD COLUMN attempts integer NOT NULL DEFAULT 0,
      ADD COLUMN next_attempt_at timestamptz NULL;
    CREATE INDEX idx_zernio_events_due ON zernio_events ((COALESCE(next_attempt_at, received_at))) WHERE processed_at IS NULL;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    DROP INDEX IF EXISTS idx_zernio_events_due;
    ALTER TABLE zernio_events DROP COLUMN IF EXISTS next_attempt_at, DROP COLUMN IF EXISTS attempts;
  `);
}
