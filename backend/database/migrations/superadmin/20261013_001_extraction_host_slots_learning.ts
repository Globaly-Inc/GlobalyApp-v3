import type { Knex } from "knex";

const S = "superadmin";

// What a host taught us, kept past the process that learned it.
//
// host-health.ts learns a per-host pace (800ms, halving to the floor on consecutive clean
// fetches, doubling on a 429) and a circuit for a host that keeps failing — in a module-level
// Map. That Map dies with the process, and docker-compose runs EIGHT worker containers, so the
// same host is learned eight times over and re-learned after every deploy. It is not only slow
// to warm up: a reservation is booked at the BOOKING process's gap, so one cold worker injects
// 800ms gaps into the slot timeline that every other process then queues behind — the learned
// floor is diluted towards the average of however many processes have met the host.
//
// Three columns on the row that already paces the host. Nullable/defaulted, and every read and
// write of them is in its own try/catch away from the reservation upsert, so an unapplied
// migration costs the LEARNING and never the pacing (the table itself already fails open that
// way, and that trade is only safe in the direction of slower).
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(S).alterTable("extraction_host_slots", (t) => {
    // null = never learned; the process starts from HOST_THROTTLE_MS as before.
    t.integer("gap_ms").nullable();
    // Consecutive unusable results, so another process inherits a half-open circuit's one-strike
    // state instead of re-spending TRIP_AFTER full-ladder failures to re-discover a dead host.
    t.integer("fails").notNullable().defaultTo(0);
    t.timestamp("open_until", { useTz: true }).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema(S).alterTable("extraction_host_slots", (t) => {
    t.dropColumn("gap_ms");
    t.dropColumn("fails");
    t.dropColumn("open_until");
  });
}
