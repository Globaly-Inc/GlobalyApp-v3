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
  // Appended: the booking handshake. See the backend schema for the lifecycle.
  "requested",
  "declined",
  "in_progress",
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
  /** Lucide icon name — drives the per-category cover when a listing has no image. */
  category_icon: string | null;
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
  /** Enough to label the thread without opening it. */
  message_count: number;
  has_review: boolean;
  notes: string | null;
  payment_refund_id: string | null;
  created_at: string;
  paid_at: string | null;
  cancelled_at: string | null;
  refunded_at: string | null;
}

export interface Review {
  id: number;
  /** Null when the reviewer never bought — reviewing does not require a purchase. */
  order_id: number | null;
  listing_id: number;
  rating: number;
  comment: string | null;
  is_verified_purchase: boolean;
  created_at: string;
}

/** What the signed-in viewer may do on a listing's reviews, resolved server-side. */
export interface MyReviewState {
  can_review: boolean;
  reason: "own_listing" | "already_reviewed" | null;
  review: Review | null;
}

/** One message in an order thread. `is_mine` is resolved per reader, not by comparing ids client-side. */
export interface OrderMessage {
  id: number;
  body: string;
  created_at: string;
  sender_id: number;
  sender_name: string;
  is_mine: boolean;
}

export interface CurrencyTotals {
  currency: Currency;
  /** Value of paid orders. Held, not paid out. */
  held_minor: number;
  /** Value returned to buyers. The only figure here that reflects money actually moving. */
  refunded_minor: number;
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
  category_icon: string | null;
  /** The questions this listing's category asks, so the booking dialog renders from one request. */
  booking_fields: BookingField[];
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
  /** Reviews are open to anyone, so a reader needs to see which came from an actual buyer. */
  is_verified_purchase: boolean;
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

// ─── Booking requests ──────────────────────────────────────────────────────
//
// Appended as one block. A buyer asks, the seller answers, and only then is there anything to pay for.

/** One question a category asks its buyers, defined by an admin in the superadmin category editor. */
export interface BookingField {
  id: number;
  key: string;
  label: string;
  type: "text" | "number" | "boolean" | "date" | "select" | "multi_select";
  is_required: boolean;
  options: (string | number)[] | null;
}

export type BookingAnswerValue = string | number | boolean | string[] | null;

/** What the seller reads on a request: answers already paired with the questions that produced them. */
export interface BookingDetails {
  answers: { key: string; label: string; value: string }[];
  note: string | null;
  decline_reason: string | null;
}
