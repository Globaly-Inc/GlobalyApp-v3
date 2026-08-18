/**
 * Per-application credit charges. Mirrors the backend's admin projection
 * (backend/src/modules/applications/repositories/applications.repository.ts,
 * listAdminCharges).
 *
 * These are CREDITS, not card payments: V1's `charge-application` debits
 * credit_wallets and V2's application_charges table has no Stripe columns at all.
 *
 * There is no `pending` status. V1 had one, meaning "we tried to charge and the
 * wallet was empty" — the absence of a charge, recorded where a reader cannot tell
 * it from a charge in flight. V3 writes nothing in that case and answers 402.
 */

export type ChargeStatus = "charged" | "waived" | "refunded";

export type ApplicationCharge = {
  id: number;
  business_id: number;
  business_name: string | null;
  application_id: number;
  student_id: number | null;
  student_name: string | null;
  service_id: number | null;
  credits_charged: number;
  status: ChargeStatus;
  charged_at: string | null;
  waived_at: string | null;
  refunded_at: string | null;
  created_at: string | null;
};

export type ChargeStats = {
  total: number;
  charged: number;
  waived: number;
  refunded: number;
  /**
   * Credits the platform actually retained — `charged` rows only. Waived and
   * refunded rows have had the money handed back, so counting them would overstate
   * revenue, which is what V1's page did by summing every row.
   */
  credits_charged: number;
};

export type VoidResult = {
  charge_id: number;
  status: ChargeStatus;
  credits_returned: number;
  already_refunded: boolean;
};

export type ListChargesParams = {
  status?: ChargeStatus;
  business_id?: number;
  from?: string;
  to?: string;
  limit?: number;
};

export type Paginated<T> = {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};
