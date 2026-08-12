import { z } from "zod";

// The 7 categories carry over from V2 unchanged. A const, not a table: they are a fixed taxonomy this
// feature owns, and the existing service_categories table is the *business* category taxonomy.
export const SERVICE_CATEGORIES = [
  "airport_pickup",
  "city_orientation",
  "rental_support",
  "employment_support",
  "assignment_help",
  "private_tutoring",
  "other",
] as const;

export const CURRENCIES = ["AUD", "USD", "GBP", "EUR"] as const;

export const ORDER_STATUSES = [
  "pending_payment",
  "paid",
  "completed",
  "disputed",
  "refunded",
  "cancelled",
] as const;

export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];
export type Currency = (typeof CURRENCIES)[number];
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Statuses that block deleting the parent listing — money is committed against them. */
export const OPEN_ORDER_STATUSES: readonly OrderStatus[] = ["pending_payment", "paid", "disputed"];

/** Statuses that accept no further action from either party. */
export const TERMINAL_ORDER_STATUSES: readonly OrderStatus[] = ["completed", "refunded", "cancelled"];

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
  category: z.enum(SERVICE_CATEGORIES, { errorMap: () => ({ message: "Pick a category" }) }),
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

export type CreateListingInput = z.infer<typeof CreateListingSchema>;
export type UpdateListingInput = z.infer<typeof UpdateListingSchema>;
export type CreateReviewInput = z.infer<typeof CreateReviewSchema>;
