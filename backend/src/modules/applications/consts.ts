// Application + charge constants. Values carried from V1's `charge-application`
// edge function and AdminApplicationCharges.tsx. Mirrored by CHECK constraints in
// 20260817_802 / _803.

export const APPLICATION_STATUSES = [
  "draft",
  "submitted",
  "under_review",
  "accepted",
  "rejected",
  "withdrawn",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const ORG_TYPES = ["business", "institution"] as const;
export type OrgType = (typeof ORG_TYPES)[number];

/**
 * V1 had `pending` too, meaning "we tried to charge and the wallet was empty".
 * That is not a charge, it is the absence of one, recorded where a reader cannot
 * tell it apart from a charge in flight. V3 writes nothing in that case and
 * returns 402 — so the vocabulary is three terminal states. See 20260817_803.
 */
export const CHARGE_STATUSES = ["charged", "waived", "refunded"] as const;
export type ChargeStatus = (typeof CHARGE_STATUSES)[number];

/** V1 `charge-application` fallback when the business has no active plan. */
export const DEFAULT_APPLICATION_CREDIT_COST = 10;

/** `credit_transactions.reference_type` for an application charge. Matches V1. */
export const CHARGE_REFERENCE_TYPE = "application";

/**
 * Derived — never supplied by a caller. This string is the value of the NOT NULL
 * UNIQUE `application_charges.idempotency_key`, and it is also handed to
 * credits.spendCredits so credit_transactions' own UNIQUE index guards the debit
 * independently. Two guards, one derivation, no client input.
 */
export function chargeIdempotencyKey(applicationId: number): string {
  return `application_charge:${applicationId}`;
}

/** Same idea for the credit-back. Keyed on the CHARGE, so one charge refunds once. */
export function refundIdempotencyKey(chargeId: number): string {
  return `application_refund:${chargeId}`;
}
