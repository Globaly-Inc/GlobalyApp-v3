import { z } from "zod";
import { webUrl } from "../../../shared/url.js";
import { PaginationSchema } from "../../../shared/pagination.js";
import { BILLING_INTERVALS, SUBSCRIPTION_STATUSES, TRANSACTION_TYPES } from "../consts.js";

// A checkout return URL is echoed straight into a redirect, so it is validated as
// an absolute http(s) URL rather than accepted as free text.
const AbsoluteUrl = webUrl().refine(
  (value) => /^https?:\/\//i.test(value),
  { message: "Must be an absolute http(s) URL" },
);

// ── Credits ─────────────────────────────────────────────────────────────────

export const PurchaseCreditsSchema = z.object({
  /** Credit bundle size. Bounded so a typo cannot mint a fortune. */
  credits: z.coerce.number().int().min(1).max(100_000),
  success_url: AbsoluteUrl,
  cancel_url: AbsoluteUrl,
  coupon_code: z.string().min(1).max(64).optional(),
});

export const VerifyPurchaseSchema = z.object({
  session_id: z.string().min(1).max(255),
});

export const SpendCreditsSchema = z.object({
  amount: z.coerce.number().int().min(1).max(100_000),
  transaction_type: z.enum(TRANSACTION_TYPES).default("enquiry_unlock"),
  description: z.string().max(500).optional(),
  reference_type: z.string().max(100).optional(),
  reference_id: z.string().max(255).optional(),
  idempotency_key: z.string().min(1).max(255).optional(),
});

export const LedgerQuerySchema = PaginationSchema.extend({
  business_id: z.coerce.number().int().positive().optional(),
  transaction_type: z.enum(TRANSACTION_TYPES).optional(),
});

// ── Subscriptions ───────────────────────────────────────────────────────────

export const SubscriptionCheckoutSchema = z.object({
  plan_code: z.string().min(1).max(100),
  interval: z.enum(BILLING_INTERVALS).default("month"),
  success_url: AbsoluteUrl,
  cancel_url: AbsoluteUrl,
  coupon_code: z.string().min(1).max(64).optional(),
});

export const VerifySubscriptionSchema = z.object({
  session_id: z.string().min(1).max(255),
});

export const PortalSchema = z.object({
  return_url: AbsoluteUrl,
});

export const FeatureParamsSchema = z.object({
  feature: z.string().min(1).max(100),
});

// ── Admin ───────────────────────────────────────────────────────────────────

export const IdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const PlanCreateSchema = z.object({
  code: z.string().min(1).max(100).regex(/^[a-z0-9_-]+$/, "lowercase letters, digits, - and _ only"),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullish(),
  tagline: z.string().max(200).nullish(),
  monthly_price: z.coerce.number().min(0).default(0),
  annual_price: z.coerce.number().min(0).default(0),
  currency: z.string().length(3).default("AUD"),
  trial_days: z.coerce.number().int().min(0).max(365).default(0),
  stripe_monthly_price_id: z.string().max(255).nullish(),
  stripe_annual_price_id: z.string().max(255).nullish(),
  monthly_credit_grant: z.coerce.number().int().min(0).default(0),
  personal_credit_per_member: z.coerce.number().int().min(0).default(0),
  monthly_ai_credits: z.coerce.number().int().min(0).default(0),
  limits: z.record(z.union([z.boolean(), z.number(), z.string()])).default({}),
  is_active: z.boolean().default(true),
  is_public: z.boolean().default(true),
  is_popular: z.boolean().default(false),
  sort_order: z.coerce.number().int().default(0),
  feature_highlights: z.array(z.string().max(200)).max(50).nullish(),
});

export const PlanUpdateSchema = PlanCreateSchema.partial();

export const CouponCreateSchema = z.object({
  code: z.string().min(1).max(64),
  description: z.string().max(500).nullish(),
  discount_type: z.enum(["percentage", "fixed"]).default("percentage"),
  discount_value: z.coerce.number().min(0),
  applicable_plans: z.array(z.string().max(100)).max(50).nullish(),
  valid_from: z.coerce.date().nullish(),
  valid_until: z.coerce.date().nullish(),
  max_uses: z.coerce.number().int().positive().nullish(),
  is_active: z.boolean().default(true),
}).refine(
  (v) => v.discount_type !== "percentage" || v.discount_value <= 100,
  { message: "A percentage discount cannot exceed 100", path: ["discount_value"] },
).refine(
  (v) => !v.valid_from || !v.valid_until || v.valid_from <= v.valid_until,
  { message: "valid_from must not be after valid_until", path: ["valid_until"] },
);

export const CouponUpdateSchema = z.object({
  description: z.string().max(500).nullish(),
  discount_type: z.enum(["percentage", "fixed"]).optional(),
  discount_value: z.coerce.number().min(0).optional(),
  applicable_plans: z.array(z.string().max(100)).max(50).nullish(),
  valid_from: z.coerce.date().nullish(),
  valid_until: z.coerce.date().nullish(),
  max_uses: z.coerce.number().int().positive().nullish(),
  is_active: z.boolean().optional(),
});

export const SubscriberQuerySchema = PaginationSchema.extend({
  status: z.enum(SUBSCRIPTION_STATUSES).optional(),
  plan_id: z.coerce.number().int().positive().optional(),
});

export type PurchaseCreditsInput = z.infer<typeof PurchaseCreditsSchema>;
export type SpendCreditsInput = z.infer<typeof SpendCreditsSchema>;
export type SubscriptionCheckoutInput = z.infer<typeof SubscriptionCheckoutSchema>;
