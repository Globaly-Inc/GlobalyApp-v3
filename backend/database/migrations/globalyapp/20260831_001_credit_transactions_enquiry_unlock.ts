import type { Knex } from "knex";

/**
 * Lets the credit ledger record an enquiry unlock.
 *
 * `chk_ct_reason` (20260816_005) was written when AI messages were the only spend, so
 * 'enquiry_unlock' had no legal value and the insert died on 23514 — which the error handler does
 * not map, so it surfaced as a bare 500 rather than anything diagnosable.
 *
 * Adds one value to that CHECK. No column, no data change.
 *
 * `reference_type`/`reference_id` are deliberately untouched and stay NULL for these rows:
 * `reference_id` is an integer and `enquiry_distributions.id` is a uuid, so the pair cannot
 * address a distribution. The identifying detail goes in `description`, which the admin ledger
 * already renders and already searches with ILIKE.
 *
 * ponytail: add a nullable `reference_uuid` if anything ever needs to join ledger rows back to
 * distributions programmatically. Nothing does today.
 */
const REASONS_BEFORE = ["signup_grant", "message", "purchase", "admin_grant", "subscription_grant"];
const REASONS_AFTER = [...REASONS_BEFORE, "enquiry_unlock"];

const list = (values: string[]) => values.map((v) => `'${v}'`).join(", ");

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE credit_transactions DROP CONSTRAINT IF EXISTS chk_ct_reason`);
  await knex.raw(
    `ALTER TABLE credit_transactions ADD CONSTRAINT chk_ct_reason CHECK (reason IN (${list(REASONS_AFTER)}))`,
  );
}

/**
 * Fails loudly if an unlock has already been recorded, rather than deleting those rows to fit.
 * The ledger is the money trail; a rollback that silently discards spends is worse than one that
 * refuses to run.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE credit_transactions DROP CONSTRAINT IF EXISTS chk_ct_reason`);
  await knex.raw(
    `ALTER TABLE credit_transactions ADD CONSTRAINT chk_ct_reason CHECK (reason IN (${list(REASONS_BEFORE)}))`,
  );
}
