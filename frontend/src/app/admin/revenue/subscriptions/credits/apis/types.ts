export type CreditReason =
  | "signup_grant"
  | "message"
  | "purchase"
  | "admin_grant"
  | "subscription_grant"
  /** A business or institution paying to reveal an enquiry's student contact details. */
  | "enquiry_unlock";

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

export type ChartMetric = "total" | "by_reason" | "by_balance_type" | "by_user" | "by_region";

export interface DailyLogEntry {
  platform_user_id: number;
  owner_name: string;
  owner_email: string;
  country_name: string | null;
  total_granted: number;
  total_used: number;
  net_change: number;
  transaction_count: number;
  closing_balance: number;
}

export interface DailyLogPage {
  data: DailyLogEntry[];
  total: number;
  page: number;
  limit: number;
  date: string;
}

export interface ChartDataPoint {
  date: string;
  value: number;
}

export interface ChartSeries {
  key: string;
  label: string;
  data: ChartDataPoint[];
}

export interface ChartResponse {
  metric: ChartMetric;
  days: number;
  series: ChartSeries[];
}
