import type { CreditKind } from "../apis/types";

/** Row labels. Referral rows are named explicitly so an operator can tell them from a purchase. */
export const KIND_LABELS: Record<CreditKind, string> = {
  referral_reward: "Referral reward",
  referral_reversal: "Referral reversed",
  purchase: "Purchase",
  manual_adjustment: "Manual adjustment",
  ai_message: "AI message",
  signup_grant: "Welcome credits",
  subscription_grant: "Subscription credits",
  admin_grant: "Admin grant",
};

// KIND_LABELS is keyed by CreditKind, so the compiler catches a new kind here. This list is plain
// strings, so it cannot — keep it in step with the backend ListQuery enum by hand.
export const KIND_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "All types" },
  ...(Object.keys(KIND_LABELS) as CreditKind[]).map((k) => ({ value: k, label: KIND_LABELS[k] })),
];
