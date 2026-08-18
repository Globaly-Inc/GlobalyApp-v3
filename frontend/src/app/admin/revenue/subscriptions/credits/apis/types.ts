export type CreditKind = "referral_reward" | "referral_reversal" | "purchase" | "manual_adjustment";

export interface CreditLedgerRow {
  id: number;
  created_at: string;
  owner_type: "user" | "business";
  owner_id: number;
  /** null when the account has been deleted — the ledger outlives it, so the row still renders. */
  owner_name: string | null;
  kind: CreditKind;
  /** Signed: positive credits the owner, negative debits. */
  amount: number;
  /** That owner's running balance at this row, from a SQL window function. */
  balance_after: number;
  description: string | null;
  reference_type: string | null;
  reference_id: number | null;
}

export interface ListCreditsParams {
  page?: number;
  limit?: number;
  kind?: CreditKind;
}

export interface PaginatedCredits {
  data: CreditLedgerRow[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}
