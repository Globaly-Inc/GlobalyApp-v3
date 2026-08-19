// Referral repository — referral_codes and referrals queries.

import type { Knex } from "knex";
import { masterKnex } from "../../../core/db/master-pool.js";
import { REWARD_BY_ACTION, type ReferralActionType, type ReferralOwnerType, type ReferralState } from "../consts.js";

/**
 * States that mean "this referral earned its reward". `credited` is included for rows settled before
 * credits became a separate feature; new rows land in `qualified`.
 */
export const TERMINAL_EARNED_STATES: ReferralState[] = ["qualified", "credited"];

export interface ReferralCodeRow {
  id: number;
  code: string;
  owner_type: ReferralOwnerType;
  owner_id: number;
  created_at: Date;
}

export interface ReferralRow {
  id: number;
  referral_code_id: number;
  referrer_type: ReferralOwnerType;
  referrer_id: number;
  referred_type: ReferralOwnerType;
  referred_id: number;
  state: ReferralState;
  action_type: ReferralActionType | null;
  qualifying_business_id: number | null;
  signed_up_at: Date;
  qualified_at: Date | null;
  expired_at: Date | null;
  // credited_at / credits_awarded remain as columns but are not written while credits are a separate
  // feature, so they are deliberately absent from this type — nothing should read them and believe them.
  // credit_transaction_id is gone entirely (20260819_001).
  void_category: string | null;
  created_at: Date;
  updated_at: Date;
}

// ── referral_codes ──

/** Case-insensitive lookup, matching the referral_codes_code_lower index. */
export async function findCodeByCode(code: string) {
  return masterKnex<ReferralCodeRow>("referral_codes")
    .whereRaw("lower(code) = lower(?)", [code])
    .first();
}

export async function findCodeById(id: number) {
  return masterKnex<ReferralCodeRow>("referral_codes").where({ id }).first();
}

export async function findCodeByOwner(ownerType: ReferralOwnerType, ownerId: number) {
  return masterKnex<ReferralCodeRow>("referral_codes")
    .where({ owner_type: ownerType, owner_id: ownerId })
    .first();
}

/**
 * Owner-scoped insert. ON CONFLICT on the OWNER constraint only — a code collision must surface as
 * 23505 so issueCode can retry with a fresh code, whereas an owner conflict means "already has one".
 * Returns undefined when the owner already had a code.
 */
export async function insertCode(ownerType: ReferralOwnerType, ownerId: number, code: string) {
  const result = await masterKnex.raw(
    `INSERT INTO referral_codes (owner_type, owner_id, code)
     VALUES (?, ?, ?)
     ON CONFLICT ON CONSTRAINT referral_codes_owner_unique DO NOTHING
     RETURNING *`,
    [ownerType, ownerId, code],
  );
  return (result.rows as ReferralCodeRow[])[0];
}

/** Entities with no referral code — drives the INV-10 reconciliation worker. */
export async function findOwnersMissingCode(
  ownerType: ReferralOwnerType,
  limit: number,
): Promise<number[]> {
  const table = ownerType === "user" ? "platform_users" : "businesses";
  return masterKnex(table)
    .whereNotExists(function () {
      this.select(masterKnex.raw("1"))
        .from("referral_codes")
        .whereRaw("referral_codes.owner_type = ?", [ownerType])
        .whereRaw(`referral_codes.owner_id = ${table}.id`);
    })
    .orderBy("id")
    .limit(limit)
    .pluck("id");
}

// ── referrals ──

export async function findReferralByReferred(
  referredType: ReferralOwnerType,
  referredId: number,
  trx?: Knex.Transaction,
) {
  return (trx ?? masterKnex)<ReferralRow>("referrals")
    .where({ referred_type: referredType, referred_id: referredId })
    .first();
}

export async function insertReferral(
  trx: Knex.Transaction,
  data: {
    referral_code_id: number;
    referrer_type: ReferralOwnerType;
    referrer_id: number;
    referred_type: ReferralOwnerType;
    referred_id: number;
  },
) {
  const [row] = await trx<ReferralRow>("referrals")
    .insert({ ...data, state: "signed_up", signed_up_at: trx.fn.now() as unknown as Date })
    .returning("*");
  return row;
}

/**
 * Referrals a given entity has made. Callers pass the terminal states — `qualified` now, plus `credited`
 * for rows that were credited before credits became a separate feature. `signed_up` and `expired` rows
 * exist in the table but are not rendered until Phase 2 ships the pending lifecycle.
 */
export async function listReferralsByReferrer(
  referrerType: ReferralOwnerType,
  referrerId: number,
  states: ReferralState[],
) {
  return masterKnex<ReferralRow>("referrals")
    .where({ referrer_type: referrerType, referrer_id: referrerId })
    .whereIn("state", states)
    .orderBy("signed_up_at", "desc");
}

/**
 * Stats row totals, counted from the same rows the history renders.
 *
 * `pending_reward_credits` is DERIVED from action_type and the configured amounts, never read from a
 * stored column: nothing has been paid yet, so there is no posted total to read. Deriving it also means
 * that when credits are linked back in, no data has to be migrated or reconciled — the figure simply
 * becomes an awarded balance instead of a pending one.
 */
export async function referrerStats(referrerType: ReferralOwnerType, referrerId: number) {
  const rows = await masterKnex("referrals")
    .where({ referrer_type: referrerType, referrer_id: referrerId })
    .whereIn("state", TERMINAL_EARNED_STATES)
    .select("action_type")
    .count({ n: "*" })
    .groupBy("action_type");

  let students_referred = 0;
  let businesses_referred = 0;
  for (const r of rows as Array<{ action_type: ReferralActionType; n: string }>) {
    if (r.action_type === "student_referral") students_referred = Number(r.n);
    if (r.action_type === "business_referral") businesses_referred = Number(r.n);
  }

  const pending_reward_credits =
    students_referred * REWARD_BY_ACTION.student_referral +
    businesses_referred * REWARD_BY_ACTION.business_referral;

  return { students_referred, businesses_referred, pending_reward_credits };
}
