// An unclaimed listing has no owner — make the owner columns nullable.
//
// Promote used to invent a placeholder platform_user for every listing, using the COMPANY name
// as first_name because extraction never captures a person's name (extraction_institution_overview
// has email and phone, no contact name). That produced a fake user per listing and a
// first_name that was never a person.
//
// Now the owner is created only when a real person's name exists — which in practice means
// businesses promoted from extraction_agents, not the institution/business from the job itself.
// Everything else stays ownerless until someone claims it and supplies their own name.
//
// businesses.owner_id was already treated as nullable by the read path: the admin list
// computes `owner_id IS NULL as is_unclaimed` and the UI renders "Unclaimed" from it. The
// column just never actually held NULL.

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Plain DROP NOT NULL — the FK and its ON DELETE behaviour are unaffected, and a NULL FK is
  // simply not checked by Postgres.
  await knex.raw(`ALTER TABLE businesses ALTER COLUMN owner_id DROP NOT NULL`);

  await knex.raw(`ALTER TABLE institutions ALTER COLUMN platform_user_id DROP NOT NULL`);
  // Collected from the claimant at accept time and written back onto the listing.
  await knex.raw(`ALTER TABLE institutions ALTER COLUMN first_name DROP NOT NULL`);
  await knex.raw(`ALTER TABLE institutions ALTER COLUMN last_name DROP NOT NULL`);
}

export async function down(knex: Knex): Promise<void> {
  // Unclaimed listings cannot satisfy NOT NULL, so they have to go before it is restored.
  // Same shape as 20260823_001's down for institutions.email.
  await knex("businesses").whereNull("owner_id").delete();
  await knex("institutions").whereNull("platform_user_id").delete();
  await knex("institutions").whereNull("first_name").update({ first_name: "" });
  await knex("institutions").whereNull("last_name").update({ last_name: "" });

  await knex.raw(`ALTER TABLE institutions ALTER COLUMN last_name SET NOT NULL`);
  await knex.raw(`ALTER TABLE institutions ALTER COLUMN first_name SET NOT NULL`);
  await knex.raw(`ALTER TABLE institutions ALTER COLUMN platform_user_id SET NOT NULL`);
  await knex.raw(`ALTER TABLE businesses ALTER COLUMN owner_id SET NOT NULL`);
}
