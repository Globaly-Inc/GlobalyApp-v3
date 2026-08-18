import type { CreditKind } from "../apis/types";

/** Row labels. Referral rows are named explicitly so an operator can tell them from a purchase. */
export const KIND_LABELS: Record<CreditKind, string> = {
  referral_reward: "Referral reward",
  referral_reversal: "Referral reversed",
  purchase: "Purchase",
  manual_adjustment: "Manual adjustment",
};

export const KIND_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "referral_reward", label: "Referral reward" },
  { value: "referral_reversal", label: "Referral reversed" },
  { value: "purchase", label: "Purchase" },
  { value: "manual_adjustment", label: "Manual adjustment" },
];
