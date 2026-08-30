export type CreditReason =
  | "signup_grant"
  | "message"
  | "purchase"
  | "admin_grant"
  | "subscription_grant";

export interface LedgerEntry {
  id: number;
  created_at: string;
  amount: number;
  balance_type: "free" | "subscription" | "purchased";
  reason: CreditReason;
  description: string | null;
  platform_user_id: number;
  owner_name: string;
  owner_email: string;
  balance_after: number;
}

export interface UserSearchResult {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
}

export interface LedgerPage {
  data: LedgerEntry[];
  total: number;
  page: number;
  limit: number;
}

export interface AdjustInput {
  user_id: number;
  amount: number;
  balance_type: "free" | "subscription" | "purchased";
  description: string;
}
