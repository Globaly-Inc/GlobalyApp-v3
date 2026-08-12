import { httpDelete, httpGet, httpPatch, httpPost, httpPostForm } from "@/lib/api/http";
import type {
  City,
  Currency,
  Listing,
  ListingInput,
  Order,
  OrderRole,
  OrderStatus,
  Review,
  ServiceCategory,
  ServicesMeta,
  Summary,
  UploadedCover,
  VerifyPaymentResult,
} from "./types";
import { CURRENCIES, ORDER_STATUSES, SERVICE_CATEGORIES } from "./types";

const BASE = "/my-services";

/**
 * Normalize at the boundary.
 *
 * The types describe the contract, but at runtime the response is whatever the deployed backend sends — an
 * older build, a partial payload, a proxy that drops a field. A component reading `listing.open_orders_count`
 * or mapping `summary.totals` on a missing value throws during render, so every field the UI touches gets a
 * default here, once, instead of a `?.` at each of a dozen call sites.
 */

function toArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/** Money is only ever an integer minor amount. A NaN or fractional value would corrupt every total. */
function toMinor(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function normalizeListing(raw: Partial<Listing> | undefined | null): Listing {
  const l = raw ?? {};
  return {
    id: Number(l.id ?? 0),
    provider_id: Number(l.provider_id ?? 0),
    title: l.title ?? "Untitled service",
    description: l.description ?? null,
    category: oneOf<ServiceCategory>(l.category, SERVICE_CATEGORIES, "other"),
    price_minor: toMinor(l.price_minor),
    currency: oneOf<Currency>(l.currency, CURRENCIES, "AUD"),
    country_id: l.country_id ?? null,
    country_name: l.country_name ?? null,
    city_id: l.city_id ?? null,
    city_name: l.city_name ?? null,
    cover_storage_path: l.cover_storage_path ?? null,
    cover_url: l.cover_url ?? null,
    is_active: l.is_active !== false,
    avg_rating: Number(l.avg_rating ?? 0),
    total_reviews: Number(l.total_reviews ?? 0),
    total_orders: Number(l.total_orders ?? 0),
    open_orders_count: Number(l.open_orders_count ?? 0),
    created_at: l.created_at ?? new Date().toISOString(),
    updated_at: l.updated_at ?? new Date().toISOString(),
  };
}

function normalizeOrder(raw: Partial<Order> | undefined | null): Order {
  const o = raw ?? {};
  return {
    id: Number(o.id ?? 0),
    listing_id: Number(o.listing_id ?? 0),
    listing_title: o.listing_title ?? "Service",
    listing_deleted: !!o.listing_deleted,
    amount_minor: toMinor(o.amount_minor),
    currency: oneOf<Currency>(o.currency, CURRENCIES, "AUD"),
    status: oneOf<OrderStatus>(o.status, ORDER_STATUSES, "pending_payment"),
    // Falling back to "buyer" would offer a review form to a seller, so default to the role with fewer
    // affordances instead.
    role: oneOf<OrderRole>(o.role, ["buyer", "provider"], "provider"),
    counterparty_name: o.counterparty_name?.trim() || "Someone",
    buyer_confirmed: !!o.buyer_confirmed,
    provider_confirmed: !!o.provider_confirmed,
    awaiting_my_confirmation: !!o.awaiting_my_confirmation,
    can_review: !!o.can_review,
    has_review: !!o.has_review,
    notes: o.notes ?? null,
    payment_refund_id: o.payment_refund_id ?? null,
    created_at: o.created_at ?? new Date().toISOString(),
    paid_at: o.paid_at ?? null,
    completed_at: o.completed_at ?? null,
    cancelled_at: o.cancelled_at ?? null,
    refunded_at: o.refunded_at ?? null,
  };
}

function normalizeSummary(raw: Partial<Summary> | undefined | null): Summary {
  const s = raw ?? {};
  return {
    totals: toArray<Partial<Summary["totals"][number]>>(s.totals).map((t) => ({
      currency: oneOf<Currency>(t.currency, CURRENCIES, "AUD"),
      held_minor: toMinor(t.held_minor),
      confirmed_minor: toMinor(t.confirmed_minor),
      orders_count: Number(t.orders_count ?? 0),
    })),
    listings_count: Number(s.listings_count ?? 0),
    purchases_count: Number(s.purchases_count ?? 0),
    received_count: Number(s.received_count ?? 0),
    // Default false: never imply a payout happened because a field was missing.
    payouts_live: s.payouts_live === true,
  };
}

export const servicesRealApi = {
  getMeta: async (): Promise<ServicesMeta> => {
    const raw = await httpGet<Partial<ServicesMeta>>(`${BASE}/meta`);
    const categories = toArray<ServiceCategory>(raw?.categories);
    const currencies = toArray<Currency>(raw?.currencies);
    return {
      categories: categories.length ? categories : [...SERVICE_CATEGORIES],
      currencies: currencies.length ? currencies : [...CURRENCIES],
      cover_upload_available: raw?.cover_upload_available === true,
      payments_live: raw?.payments_live === true,
    };
  },

  getSummary: async (): Promise<Summary> => normalizeSummary(await httpGet<Partial<Summary>>(`${BASE}/summary`)),

  getListings: async (): Promise<Listing[]> => {
    const raw = await httpGet<{ listings?: Partial<Listing>[] }>(`${BASE}/listings`);
    return toArray<Partial<Listing>>(raw?.listings).map(normalizeListing);
  },

  getListing: async (serviceId: number): Promise<Listing> =>
    normalizeListing(await httpGet<Partial<Listing>>(`${BASE}/listings/${serviceId}`)),

  createListing: async (input: ListingInput): Promise<Listing> =>
    normalizeListing(await httpPost<Partial<Listing>>(`${BASE}/listings`, input)),

  updateListing: async (serviceId: number, input: Partial<ListingInput>): Promise<Listing> =>
    normalizeListing(await httpPatch<Partial<Listing>>(`${BASE}/listings/${serviceId}`, input)),

  deleteListing: (serviceId: number): Promise<void> => httpDelete(`${BASE}/listings/${serviceId}`),

  uploadCover: async (file: File): Promise<UploadedCover> => {
    const form = new FormData();
    form.append("file", file);
    const raw = await httpPostForm<Partial<UploadedCover>>(`${BASE}/listings/cover`, form);
    if (!raw?.storage_path) throw new Error("Upload did not return a storage path");
    return { storage_path: raw.storage_path, url: raw.url ?? null };
  },

  getPurchases: async (): Promise<Order[]> => {
    const raw = await httpGet<{ orders?: Partial<Order>[] }>(`${BASE}/orders`);
    return toArray<Partial<Order>>(raw?.orders).map(normalizeOrder);
  },

  getReceivedOrders: async (): Promise<Order[]> => {
    const raw = await httpGet<{ orders?: Partial<Order>[] }>(`${BASE}/received-orders`);
    return toArray<Partial<Order>>(raw?.orders).map(normalizeOrder);
  },

  getOrder: async (orderId: number): Promise<Order> =>
    normalizeOrder(await httpGet<Partial<Order>>(`${BASE}/orders/${orderId}`)),

  verifyPayment: async (sessionId: string): Promise<VerifyPaymentResult> => {
    const raw = await httpPost<Partial<VerifyPaymentResult>>(`${BASE}/orders/payment/verify`, {
      session_id: sessionId,
    });
    return {
      success: true,
      order_id: Number(raw?.order_id ?? 0),
      already_verified: raw?.already_verified === true,
    };
  },

  confirmCompletion: async (orderId: number): Promise<Order> =>
    normalizeOrder(await httpPost<Partial<Order>>(`${BASE}/orders/${orderId}/complete`, {})),

  disputeOrder: async (orderId: number, reason: string): Promise<Order> =>
    normalizeOrder(await httpPost<Partial<Order>>(`${BASE}/orders/${orderId}/dispute`, { reason })),

  cancelOrder: async (orderId: number): Promise<Order> =>
    normalizeOrder(await httpPost<Partial<Order>>(`${BASE}/orders/${orderId}/cancel`, {})),

  refundOrder: async (orderId: number): Promise<Order> =>
    normalizeOrder(await httpPost<Partial<Order>>(`${BASE}/orders/${orderId}/refund`, {})),

  getReview: async (orderId: number): Promise<Review | null> => {
    const raw = await httpGet<{ review?: Review | null }>(`${BASE}/orders/${orderId}/review`);
    return raw?.review ?? null;
  },

  createReview: (orderId: number, input: { rating: number; comment?: string | null }): Promise<Review> =>
    httpPost<Review>(`${BASE}/orders/${orderId}/review`, input),

  /**
   * Cities for the listing form's location pair.
   *
   * Calls the endpoint that already exists on platform-users rather than adding a method to the shared geo
   * module — this feature reads it, it does not own it. Countries come from `geoApi.getCountries()`, also
   * read-only.
   */
  getCities: async (countryId: number): Promise<City[]> => {
    const raw = await httpGet<City[] | { cities?: City[] }>(`/platform-users/countries/${countryId}/cities`);
    const list = Array.isArray(raw) ? raw : toArray<City>(raw?.cities);
    return list.map((c) => ({ id: Number(c.id), name: c.name ?? "" })).filter((c) => !!c.id);
  },
};
