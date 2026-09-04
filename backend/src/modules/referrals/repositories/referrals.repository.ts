// Referral repository — referral_codes and referrals queries.

import type { Knex } from "knex";
import { masterKnex } from "../../../core/db/master-pool.js";
import type { OwnerType, ReferralActionType, ReferralState } from "../consts.js";

export interface ReferralCodeRow {
  id: number;
  code: string;
  owner_type: OwnerType;
  owner_id: number;
  created_at: Date;
}

export interface ReferralRow {
  id: number;
  referral_code_id: number;
  referrer_type: OwnerType;
  referrer_id: number;
  referred_type: OwnerType;
  referred_id: number;
  state: ReferralState;
  action_type: ReferralActionType | null;
  qualifying_business_id: number | null;
  signed_up_at: Date;
  qualified_at: Date | null;
  credited_at: Date | null;
  expired_at: Date | null;
  credits_awarded: number | null;
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

export async function findCodeByOwner(ownerType: OwnerType, ownerId: number) {
  return masterKnex<ReferralCodeRow>("referral_codes")
    .where({ owner_type: ownerType, owner_id: ownerId })
    .first();
}

/**
 * Owner-scoped insert. ON CONFLICT on the OWNER constraint only — a code collision must surface as
 * 23505 so issueCode can retry with a fresh code, whereas an owner conflict means "already has one".
 * Returns undefined when the owner already had a code.
 */
export async function insertCode(ownerType: OwnerType, ownerId: number, code: string) {
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
  ownerType: OwnerType,
  limit: number,
): Promise<number[]> {
  const table = ownerType === "user" ? "platform_users" : "businesses";
  return masterKnex(table)
    .whereNotExists(function () {
      this.select(masterKnex.raw("1"))
        .from("referral_codes")
        .whereRaw("referral_codes.owner_type = ?", [ownerType])
        .whereRaw(`referral_codes.owner_id = ??.id`, [table]);
    })
    .orderBy("id")
    .limit(limit)
    .pluck("id");
}

// ── referrals ──

export async function findReferralByReferred(
  referredType: OwnerType,
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
    referrer_type: OwnerType;
    referrer_id: number;
    referred_type: OwnerType;
    referred_id: number;
  },
) {
  const [row] = await trx<ReferralRow>("referrals")
    .insert({ ...data, state: "signed_up", signed_up_at: trx.fn.now() as unknown as Date })
    .returning("*");
  return row;
}

/** Referrals a given entity has made, newest first. */
export async function listReferralsByReferrer(
  referrerType: OwnerType,
  referrerId: number,
  states: ReferralState[],
) {
  return masterKnex<ReferralRow>("referrals")
    .where({ referrer_type: referrerType, referrer_id: referrerId })
    .whereIn("state", states)
    .orderBy("signed_up_at", "desc");
}

/** Counts for the stats row. Credit totals return with the credits phase. */
export async function referrerStats(referrerType: OwnerType, referrerId: number) {
  const row = await masterKnex("referrals")
    .where({ referrer_type: referrerType, referrer_id: referrerId })
    .select({
      total_referred: masterKnex.raw("count(*)"),
      total_credits: masterKnex.raw("coalesce(sum(credits_awarded), 0)"),
      students_referred: masterKnex.raw("count(*) filter (where action_type = 'student_referral')"),
      businesses_referred: masterKnex.raw("count(*) filter (where action_type = 'business_referral')"),
    })
    .first<{ total_referred: string; total_credits: string; students_referred: string; businesses_referred: string }>();
  return {
    total_referred: Number(row?.total_referred ?? 0),
    total_credits: Number(row?.total_credits ?? 0),
    students_referred: Number(row?.students_referred ?? 0),
    businesses_referred: Number(row?.businesses_referred ?? 0),
  };
}
