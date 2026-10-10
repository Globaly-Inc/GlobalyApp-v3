import type { Knex } from "knex";

/**
 * Does this org still owe its owner the welcome splash? Replaces a localStorage flag and the
 * `?welcome=1` URL param, so the decision survives a new device, a shared link and the OTP hop.
 *
 * A boolean with NOT NULL DEFAULT false rather than a `welcome_seen_at` timestamp, because a
 * nullable timestamp cannot tell "never owed one" from "owed one, not yet shown" — and this row is
 * created lazily (71 of 74 orgs have none), so every org that predates this feature would have read
 * as owed and been shown the splash. The default answers for all of them without a backfill.
 *
 * Set true only when an onboarding invitation is accepted; set false when the splash is dismissed.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("business_onboarding_progress", (t) => {
    t.boolean("welcome_pending").notNullable().defaultTo(false);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("business_onboarding_progress", (t) => {
    t.dropColumn("welcome_pending");
  });
}
