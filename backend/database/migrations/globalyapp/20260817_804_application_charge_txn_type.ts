// Adds `application_charge` to credit_transactions.transaction_type (Wave G5).
//
// V1's `charge-application` debited the wallet with `p_type: 'enquiry_unlock'`,
// because V1's enum had no application value and someone needed the call to
// succeed. The result is that every enquiry-unlock report in V1 silently includes
// application charges — the ledger's own type column lies about what was sold.
// Legacy bugs are not the spec (§1.6): reported as defect D-G5-5.
//
// `reference_type = 'application'` already distinguishes the two rows, so this is
// not a correctness fix for the charge itself — it is a fix for every aggregate
// that groups by transaction_type, including the existing enquiries suite, which
// asserts on `.where({ transaction_type: 'enquiry_unlock' })`.
//
// Additive, and the constraint is recreated rather than edited in place because
// 20260816_005 has already run against the shared dev/test databases.

import type { Knex } from "knex";

const CONSTRAINT = "credit_transactions_transaction_type_check";

const BEFORE = [
  "subscription_grant", "purchase", "enquiry_unlock", "ad_spend", "ai_deduct",
  "referral_reward", "profile_bonus", "refund", "manual_adjustment",
] as const;

const AFTER = [...BEFORE, "application_charge"] as const;

function checkSql(values: readonly string[]): string {
  return `transaction_type IN ('${values.join("','")}')`;
}

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE credit_transactions DROP CONSTRAINT IF EXISTS ??`, [CONSTRAINT]);
  await knex.raw(`ALTER TABLE credit_transactions ADD CONSTRAINT ?? CHECK (${checkSql(AFTER)})`, [CONSTRAINT]);
}

export async function down(knex: Knex): Promise<void> {
  await knex("credit_transactions").where({ transaction_type: "application_charge" }).delete();
  await knex.raw(`ALTER TABLE credit_transactions DROP CONSTRAINT IF EXISTS ??`, [CONSTRAINT]);
  await knex.raw(`ALTER TABLE credit_transactions ADD CONSTRAINT ?? CHECK (${checkSql(BEFORE)})`, [CONSTRAINT]);
}
