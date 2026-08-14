import { z } from "zod";

// Categories are rows in service_categories, administered at /admin/platform/categories — not an enum here.
// The seven the feature launched with are inserted by 20260813_001; an admin can add, rename or retire one
// without a deploy, which a CHECK constraint made impossible.

export const CURRENCIES = ["AUD", "USD", "GBP", "EUR"] as const;

export const ORDER_STATUSES = [
  "pending_payment",
  "paid",
  "completed",
  "disputed",
  "refunded",
  "cancelled",
  // Appended rather than inserted in lifecycle order: this array is only a membership set, and appending
  // keeps the diff to added lines.
  "requested",
  "declined",
  "in_progress",
] as const;

export type Currency = (typeof CURRENCIES)[number];
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * Statuses that block deleting the parent listing.
 *
 * `requested` is here because a buyer is waiting on an answer, and `in_progress` because the seller is
 * mid-job — deleting the listing under either would strand someone even though no money has moved in the
 * first case.
 */
export const OPEN_ORDER_STATUSES: readonly OrderStatus[] = [
  "requested",
  "pending_payment",
  "paid",
  "in_progress",
  "disputed",
];

/** Statuses that accept no further action from either party. */
export const TERMINAL_ORDER_STATUSES: readonly OrderStatus[] = [
  "completed",
  "refunded",
  "cancelled",
  "declined",
];

// ─── Listings ──────────────────────────────────────────────────────────────

// price_minor, not price: money crosses the wire as an integer minor amount in both directions, so no amount
// is ever a float in JSON. The single major↔minor conversion lives in the form.
const priceMinor = z
  .number({ invalid_type_error: "Price is required" })
  .int("Price must be a whole number of minor units")
  .positive("Price must be greater than zero")
  .max(99_999_999);

const listingFields = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  category_id: z.number({ invalid_type_error: "Pick a category" }).int().positive("Pick a category"),
  description: z.string().trim().max(5000).nullable().optional(),
  price_minor: priceMinor,
  currency: z.enum(CURRENCIES).default("AUD"),
  country_id: z.number().int().positive().nullable().optional(),
  city_id: z.number().int().positive().nullable().optional(),
  cover_storage_path: z.string().min(1).nullable().optional(),
  is_active: z.boolean().default(true),
});

// .strict() so provider_id, avg_rating, total_reviews, total_orders or any id in the body is rejected
// loudly rather than silently stripped. The owner always comes from the JWT and every derived figure is
// server-maintained.
export const CreateListingSchema = listingFields
  .strict()
  // A city belonging to another country would render as a mismatched location. The service verifies the pair
  // against the cities table; this catches the obvious half-set case first.
  .refine((v) => !v.city_id || !!v.country_id, {
    message: "Pick a country before a city",
    path: ["city_id"],
  });

export const UpdateListingSchema = listingFields
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

export const ListingIdParamSchema = z.object({ serviceId: z.coerce.number().int().positive() });

// ─── Orders ────────────────────────────────────────────────────────────────

export const OrderIdParamSchema = z.object({ orderId: z.coerce.number().int().positive() });

/**
 * Placing an order.
 *
 * The buyer sends the listing and nothing else that costs money — amount, currency and provider are read from
 * the listing server-side and snapshotted onto the order, so a client cannot name its own price.
 */
export const CreateOrderSchema = z
  .object({
    listing_id: z.number().int().positive(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();

/** Public browse. Every filter optional; `limit` capped server-side. */
export const BrowseQuerySchema = z
  .object({
    search: z.string().trim().max(200).optional(),
    category_id: z.coerce.number().int().positive().optional(),
    country_id: z.coerce.number().int().positive().optional(),
    city_id: z.coerce.number().int().positive().optional(),
    currency: z.enum(CURRENCIES).optional(),
    // Minor units, like every other amount on the wire — the UI converts once.
    min_price: z.coerce.number().int().nonnegative().optional(),
    max_price: z.coerce.number().int().positive().optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(48).default(12),
  })
  // An inverted range would silently return nothing; say so instead.
  .refine((v) => v.min_price === undefined || v.max_price === undefined || v.min_price <= v.max_price, {
    message: "The minimum price cannot be above the maximum",
    path: ["min_price"],
  });

export const VerifyPaymentSchema = z.object({ session_id: z.string().trim().min(1).max(255) }).strict();

export const DisputeSchema = z
  .object({ reason: z.string().trim().min(1, "Tell us what went wrong").max(2000) })
  .strict();

export const CreateReviewSchema = z
  .object({
    rating: z.number().int().min(1, "Pick a rating").max(5),
    comment: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();

/** One message in an order thread. `.trim()` before `.min(1)`, so whitespace is not a message. */
export const SendMessageSchema = z
  .object({ body: z.string().trim().min(1, "Write a message first").max(4000) })
  .strict();

export type CreateListingInput = z.infer<typeof CreateListingSchema>;
export type UpdateListingInput = z.infer<typeof UpdateListingSchema>;
export type CreateReviewInput = z.infer<typeof CreateReviewSchema>;

// ─── Booking requests ──────────────────────────────────────────────────────
//
// Appended rather than woven into the sections above, so this block reads as one change.

/**
 * A booking request. The buyer names a listing and answers whatever that listing's category asks for.
 *
 * `answers` is deliberately loose here — a record of scalars — because the questions are data, defined per
 * category in `schema_fields`. Zod cannot know them at compile time, so the real validation happens in
 * `booking.service.ts` against the field definitions. What this schema does enforce is the shape: no nested
 * objects, no arrays of objects, nothing that could smuggle a payload into jsonb.
 */
export const BookingAnswerValueSchema = z.union([
  z.string().max(2000),
  z.number(),
  z.boolean(),
  z.array(z.string().max(200)).max(50),
  z.null(),
]);

export const CreateBookingSchema = z
  .object({
    listing_id: z.number().int().positive(),
    answers: z.record(z.string().max(100), BookingAnswerValueSchema).default({}),
    note: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();

/** A decline must say why. Enforced here, in the service, and by a DB CHECK. */
export const DeclineBookingSchema = z
  .object({ reason: z.string().trim().min(1, "Tell the buyer why").max(2000) })
  .strict();

export type CreateBookingInput = z.infer<typeof CreateBookingSchema>;
export type BookingAnswers = Record<string, z.infer<typeof BookingAnswerValueSchema>>;
