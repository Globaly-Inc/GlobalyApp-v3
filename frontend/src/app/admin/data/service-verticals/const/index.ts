import type { VerticalSlug } from "../apis/types";

export const VERTICAL_STATUS_TABS = [
  { value: "pending", label: "Pending" },
  { value: "promoted", label: "Promoted" },
  { value: "discarded", label: "Discarded" },
  { value: "all", label: "All" },
] as const;

/**
 * The fields worth showing on a review card, per vertical.
 *
 * The staging tables are 62–90 columns wide; an admin deciding promote-or-discard
 * needs the handful that identify and price the offer, and the rest travel to
 * category_specific_data on promote either way. Column names match the migrations
 * (superadmin/20260812_001..008) — note test_preparation's `test_type`, which is
 * the one vertical that does not call it `type`.
 */
export const VERTICAL_CARD_FIELDS: Record<VerticalSlug, readonly string[]> = {
  accommodation: ["type", "property_type", "room_type", "city", "min_stay_weeks", "availability"],
  insurance: ["type", "plan_tier", "cover_type", "cover_duration_months", "meets_visa_requirement"],
  banking: ["type", "account_type", "monthly_fee", "annual_fee", "interest_rate", "min_deposit"],
  visa_services: ["type", "registration_number", "registration_body", "city", "years_experience"],
  test_preparation: ["test_type", "test_variant", "format", "duration_weeks", "target_score", "city"],
  career_services: ["type", "delivery_mode", "sessions_included", "placement_rate", "city"],
  translation: ["type", "certification", "turnaround_time", "fee_per_page", "city"],
  transport: ["type", "coverage_area", "max_passengers", "booking_method", "city"],
};

/** The staged price triple per vertical, or null where the vertical has no single price. */
export const VERTICAL_PRICE_FIELDS: Record<
  VerticalSlug,
  { amount: string; currency: string; period: string | null } | null
> = {
  accommodation: { amount: "price_amount", currency: "price_currency", period: "price_period" },
  insurance: { amount: "premium_amount", currency: "premium_currency", period: "premium_period" },
  // A bank account has a monthly fee, an annual fee and a dozen transaction fees;
  // none of them is "the price", so the backend promotes none of them either.
  banking: null,
  visa_services: { amount: "fee_amount", currency: "fee_currency", period: "fee_type" },
  test_preparation: { amount: "fee_amount", currency: "fee_currency", period: "fee_period" },
  career_services: { amount: "fee_amount", currency: "fee_currency", period: "fee_type" },
  translation: { amount: "fee_amount", currency: "fee_currency", period: "fee_type" },
  transport: { amount: "fee_amount", currency: "fee_currency", period: "fee_type" },
};
