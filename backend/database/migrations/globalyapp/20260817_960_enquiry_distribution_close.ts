// enquiry_distributions.closed_at / close_reason — the audit trail behind the
// business inbox's "Close" action.
//
// `status = 'closed'` already exists: 20260817_100 wrote the CHECK from V1's
// four distribution statuses, and 'closed' was one of them. Nothing ever set it,
// so closing was a transition the schema allowed and no code exposed. These two
// columns are what that transition needs to be worth recording.
//
// ── why store the reason at all ──
// `close_reason` is a V3 addition — it appears nowhere in V1's edge functions, so
// there is no parity constraint either way. The business inbox UI collects it and
// sends it, and a client sending a field the server silently discards is a defect
// waiting to be filed. Storing it costs one nullable column and gives the lead
// pipeline the only signal it has for *why* paid leads die.
//
// ── why a dedicated timestamp ──
// `updated_at` cannot answer "when was this closed": any later write to the row
// moves it. `closed_at` is set exactly once, by the close transition, and is the
// column an inbox row is rendered from.
//
// Both nullable with no default: a distribution that was never closed has no
// close time and no reason, and NULL is the honest representation of that.

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("enquiry_distributions", (t) => {
    t.timestamp("closed_at", { useTz: true }).nullable();
    t.text("close_reason").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("enquiry_distributions", (t) => {
    t.dropColumn("close_reason");
    t.dropColumn("closed_at");
  });
}
