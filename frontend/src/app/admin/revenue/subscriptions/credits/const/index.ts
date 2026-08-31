import type { CreditReason } from "../apis/types";

export const REASON_LABELS: Record<CreditReason, string> = {
  admin_grant: "Manual adjustment",
  subscription_grant: "Subscription grant",
  message: "AI tool usage",
  signup_grant: "Profile completion bonus",
  purchase: "Purchase",
};

export const REASON_FILTER_OPTIONS = [
  { value: "", label: "All types" },
  { value: "admin_grant", label: "Manual adjustment" },
  { value: "subscription_grant", label: "Subscription grant" },
  { value: "message", label: "AI tool usage" },
  { value: "signup_grant", label: "Profile completion bonus" },
  { value: "purchase", label: "Purchase" },
];

export type { ChartMetric } from "../apis/types";

export const CHART_METRIC_OPTIONS = [
  { value: "total", label: "Total Usage" },
  { value: "by_reason", label: "By Reason" },
  { value: "by_balance_type", label: "By Balance Type" },
  { value: "by_user", label: "By Top Users" },
  { value: "by_region", label: "By Region" },
] as const;

export const CHART_COLORS = [
  "#6366f1", // indigo
  "#f59e0b", // amber
  "#10b981", // emerald
  "#f43f5e", // rose
  "#8b5cf6", // violet
  "#06b6d4", // cyan
];
