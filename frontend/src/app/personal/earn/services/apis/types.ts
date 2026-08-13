// Wire types for Earn → My Services.
//
// Money crosses the wire as an **integer minor amount** (`price_minor`, `amount_minor`, `*_minor`) in both
// directions, so no money value is ever a float in JSON. The single major↔minor conversion lives in
// utils/index.ts and is used by the form and the formatter — nowhere else.

export const CURRENCIES = ["AUD", "USD", "GBP", "EUR"] as const;

/** A row in service_categories, administered at /admin/platform/categories — not an enum. */
export interface ServiceCategory {
  id: number;
  slug: string;
  name: string;
  description?: string | null;
  icon?: string | null;
}

export const ORDER_STATUSES = [
  "pending_payment",
  "paid",
  "completed",
  "disputed",
  "refunded",
  "cancelled",
] as const;

export type Currency = (typeof CURRENCIES)[number];
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type OrderRole = "buyer" | "provider";

export interface Listing {
  id: number;
  provider_id: number;
  title: string;
  description: string | null;
  category_id: number;
  category_slug: string;
  category_name: string;
  price_minor: number;
  currency: Currency;
  country_id: number | null;
  country_name: string | null;
  city_id: number | null;
  city_name: string | null;
  cover_storage_path: string | null;
  cover_url: string | null;
  is_active: boolean;
  avg_rating: number;
  total_reviews: number;
  total_orders: number;
  /** Orders with money committed against them. Non-zero means Delete is refused and Pause is the way out. */
  open_orders_count: number;
  created_at: string;
  updated_at: string;
}

export interface ListingInput {
  title: string;
  category_id: number;
  description?: string | null;
  price_minor: number;
  currency: Currency;
  country_id?: number | null;
  city_id?: number | null;
  cover_storage_path?: string | null;
  is_active?: boolean;
}

export interface Order {
  id: number;
  listing_id: number;
  listing_title: string;
  listing_deleted: boolean;
  amount_minor: number;
  currency: Currency;
  status: OrderStatus;
  /** Decided server-side from the order row — the client never infers which side it is on. */
  role: OrderRole;
  counterparty_name: string;
  buyer_confirmed: boolean;
  provider_confirmed: boolean;
  awaiting_my_confirmation: boolean;
  can_review: boolean;
  has_review: boolean;
  notes: string | null;
  payment_refund_id: string | null;
  created_at: string;
  paid_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  refunded_at: string | null;
}

export interface Review {
  id: number;
  order_id: number;
  listing_id: number;
  rating: number;
  comment: string | null;
  created_at: string;
}

export interface CurrencyTotals {
  currency: Currency;
  /** Value of paid-but-unconfirmed orders. Held, not paid out. */
  held_minor: number;
  /** Value of orders both parties confirmed. Still not paid out. */
  confirmed_minor: number;
  orders_count: number;
}

export interface Summary {
  /** One bucket per currency. Never summed across currencies — there is no conversion anywhere. */
  totals: CurrencyTotals[];
  listings_count: number;
  purchases_count: number;
  received_count: number;
  /**
   * Always false in this phase: there is no Stripe Connect account and no transfer, so the totals above are
   * order values, not money the seller has received. The UI must not imply otherwise.
   */
  payouts_live: boolean;
}

/** What a buyer sees. Narrower than `Listing` — no storage paths, no open-order counts. */
export interface PublicService {
  id: number;
  title: string;
  description: string | null;
  category_id: number;
  category_slug: string;
  category_name: string;
  price_minor: number;
  currency: Currency;
  country_name: string | null;
  city_name: string | null;
  cover_url: string | null;
  avg_rating: number;
  total_reviews: number;
  total_orders: number;
  /** Exposed so the UI can recognise your own listing and hide Buy. */
  provider_id: number;
  provider_name: string;
  provider_photo_url: string | null;
  created_at: string;
}

export interface PublicReview {
  id: number;
  rating: number;
  comment: string | null;
  created_at: string;
  reviewer_name: string;
  reviewer_photo_url: string | null;
}

export interface BrowseFilters {
  search?: string;
  category_id?: number;
  country_id?: number;
  city_id?: number;
  currency?: Currency;
  /** Minor units, matching every other amount on the wire. */
  min_price?: number;
  max_price?: number;
  page?: number;
  limit?: number;
}

export interface BrowseResult {
  services: PublicService[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface CheckoutSession {
  url: string;
  session_id: string;
}

export interface ServicesMeta {
  // Mutable arrays: this lands in a Redux slice, and Immer's draft type rejects readonly ones.
  categories: ServiceCategory[];
  currencies: Currency[];
  /** False when no storage bucket is configured — the form hides the image field rather than offering one that fails. */
  cover_upload_available: boolean;
  payments_live: boolean;
}

export interface VerifyPaymentResult {
  success: true;
  order_id: number;
  /** True when the order was already settled — a reload, not a failure. */
  already_verified: boolean;
}

export interface UploadedCover {
  storage_path: string;
  url: string | null;
}

export interface City {
  id: number;
  name: string;
}
