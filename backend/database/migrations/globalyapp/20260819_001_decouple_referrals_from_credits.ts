// Decouples referrals from the credit ledger.
//
// Credits are being built as their own feature and will be linked back to referrals later. Until then a
// referral must still run its whole loop — code, capture, attribution, qualification — it just stops
// paying out. So the terminal success state becomes `qualified` rather than `credited`: the referral
// records THAT it earned a reward and which kind, and the payout is a separate concern.
//
// Deliberately additive and easy to reverse:
//  * `credited` stays in the state constraint. Rows already credited (with real ledger rows behind them)
//    keep their meaning — rewriting them to `qualified` would misrepresent history. Nothing new is
//    written in that state.
//  * `credits_awarded` and `credited_at` stay as nullable columns, simply unwritten. Dropping and
//    re-adding them later is churn, and existing rows keep their data. The referrals_credited_complete
//    check still guards `credited` rows and now just never fires.
//  * `credit_transaction_id` IS dropped, because that foreign key is the actual link to the ledger and
//    leaving it would keep referrals structurally coupled to a table being rebuilt elsewhere.
//
// When credits ship: add the FK back, add a `qualified -> credited` transition, and pay out every row
// sitting in `qualified` — qualified_at and action_type are exactly the record needed to do that
// retroactively.

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // 1. Sever the hard link to the ledger.
  await knex.raw(`ALTER TABLE referrals DROP COLUMN IF EXISTS credit_transaction_id`);

  // 2. Admit `qualified` as a terminal state.
  await knex.raw(`ALTER TABLE referrals DROP CONSTRAINT IF EXISTS referrals_state_check`);
  await knex.raw(`
    ALTER TABLE referrals ADD CONSTRAINT referrals_state_check CHECK (
      state IN ('signed_up', 'qualified', 'credited', 'expired', 'voided', 'rejected')
    )
  `);

  // 3. A qualified row must carry the facts a later payout needs. Both are set in the same UPDATE that
  //    claims the row, so this can only fire if someone adds a partial write later.
  await knex.raw(`ALTER TABLE referrals DROP CONSTRAINT IF EXISTS referrals_qualified_complete`);
  await knex.raw(`
    ALTER TABLE referrals ADD CONSTRAINT referrals_qualified_complete CHECK (
      state <> 'qualified' OR (qualified_at IS NOT NULL AND action_type IS NOT NULL)
    )
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE referrals DROP CONSTRAINT IF EXISTS referrals_qualified_complete`);
  await knex.raw(`ALTER TABLE referrals DROP CONSTRAINT IF EXISTS referrals_state_check`);
  await knex.raw(`
    ALTER TABLE referrals ADD CONSTRAINT referrals_state_check CHECK (
      state IN ('signed_up', 'credited', 'expired', 'voided', 'rejected')
    )
  `);
  // Restored nullable and without the FK: credit_transactions may not exist in the shape it had when
  // this ran, and a down migration must not depend on another feature's schema.
  await knex.raw(`ALTER TABLE referrals ADD COLUMN IF NOT EXISTS credit_transaction_id integer`);
}
