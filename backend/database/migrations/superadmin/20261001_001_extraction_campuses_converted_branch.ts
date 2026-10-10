// Each extracted campus is converted into a real branch org (business-branches.service's
// convertCampusesToBranches). converted_branch_id records which business_branches row it became,
// so the merged branch list stops showing the campus beside its own branch. Plain uuid, no FK —
// the branch lives in the org's tenant schema.
// convert_claimed_at: a run is converting it now; a claim older than the stale window is
// reclaimable, so a worker that dies mid-way can't strand the campus. convert_claim_id names the
// current claim: only the run holding it may record success or failure.
// convert_failed_at: conversion failed, possibly after minting an org (and its schema), so it is
// not retried automatically — clear it to retry.

import type { Knex } from "knex";

const S = "superadmin";
const TABLE = "extraction_campuses";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(S).alterTable(TABLE, (t) => {
    t.uuid("converted_branch_id").nullable();
    t.timestamp("convert_claimed_at", { useTz: true }).nullable();
    t.uuid("convert_claim_id").nullable();
    t.timestamp("convert_failed_at", { useTz: true }).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  // IF EXISTS: a database that ran this file's first version never got the convert_* columns.
  await knex.raw(`
    ALTER TABLE ${S}.${TABLE}
      DROP COLUMN IF EXISTS converted_branch_id,
      DROP COLUMN IF EXISTS convert_claimed_at,
      DROP COLUMN IF EXISTS convert_claim_id,
      DROP COLUMN IF EXISTS convert_failed_at
  `);
}
