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
