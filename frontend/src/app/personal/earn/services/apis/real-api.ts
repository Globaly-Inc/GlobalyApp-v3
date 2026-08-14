import { httpDelete, httpGet, httpPatch, httpPost, httpPostForm } from "@/lib/api/http";
import type {
  BrowseFilters,
  BrowseResult,
  CheckoutSession,
  City,
  Currency,
  Listing,
  ListingInput,
  Order,
  OrderRole,
  OrderStatus,
  PublicReview,
  MyReviewState,
  OrderMessage,
  PublicService,
  Review,
  ServiceCategory,
  ServicesMeta,
  Summary,
  UploadedCover,
  VerifyPaymentResult,
} from "./types";
import { CURRENCIES, ORDER_STATUSES } from "./types";

const BASE = "/my-services";
/** Unauthenticated marketplace routes. Separate prefix, separate file on the server. */
const PUBLIC = "/services";

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
    category_id: Number(l.category_id ?? 0),
    category_slug: l.category_slug ?? "other",
    category_icon: l.category_icon ?? null,
    category_name: l.category_name ?? "Other",
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
    message_count: Number(o.message_count ?? 0),
    has_review: !!o.has_review,
    notes: o.notes ?? null,
    payment_refund_id: o.payment_refund_id ?? null,
    created_at: o.created_at ?? new Date().toISOString(),
    paid_at: o.paid_at ?? null,
    cancelled_at: o.cancelled_at ?? null,
    refunded_at: o.refunded_at ?? null,
  };
}

/** Defaults every field the thread UI touches, so a partial response cannot throw during render. */
function normalizeMessage(m: Partial<OrderMessage> | undefined | null): OrderMessage {
  const raw = m ?? {};
  return {
    id: Number(raw.id ?? 0),
    body: raw.body ?? "",
    created_at: raw.created_at ?? new Date().toISOString(),
    sender_id: Number(raw.sender_id ?? 0),
    sender_name: raw.sender_name?.trim() || "Someone",
    // Default false: a missing flag renders the bubble as the counterparty's, which is the safer wrong.
    is_mine: raw.is_mine === true,
  };
}

function normalizeSummary(raw: Partial<Summary> | undefined | null): Summary {
  const s = raw ?? {};
  return {
    totals: toArray<Partial<Summary["totals"][number]>>(s.totals).map((t) => ({
      currency: oneOf<Currency>(t.currency, CURRENCIES, "AUD"),
      held_minor: toMinor(t.held_minor),
      refunded_minor: toMinor(t.refunded_minor),
      orders_count: Number(t.orders_count ?? 0),
    })),
    listings_count: Number(s.listings_count ?? 0),
    purchases_count: Number(s.purchases_count ?? 0),
    received_count: Number(s.received_count ?? 0),
    // Default false: never imply a payout happened because a field was missing.
    payouts_live: s.payouts_live === true,
  };
}

function normalizeCategory(raw: Partial<ServiceCategory> | undefined | null): ServiceCategory {
  const c = raw ?? {};
  return {
    id: Number(c.id ?? 0),
    slug: c.slug ?? "other",
    name: c.name ?? "Other",
    description: c.description ?? null,
    icon: c.icon ?? null,
  };
}

/**
 * Normalizing must not invent selectable options.
 *
 * A backend older than the category migration returns the previous enum — bare strings, not rows. Each one
 * normalizes to `{ id: 0, name: "Other" }`, so the picker filled up with seven identical "Other" entries that
 * all submitted `category_id: 0` and got a 400. Defaulting a field the UI *reads* is right; keeping an entry
 * the UI can *choose* when it has no id is not. An empty picker is the honest signal.
 */
function usableCategories(raw: unknown): ServiceCategory[] {
  return toArray<Partial<ServiceCategory>>(raw).map(normalizeCategory).filter((c) => c.id > 0);
}

function normalizePublicService(raw: Partial<PublicService> | undefined | null): PublicService {
  const s = raw ?? {};
  return {
    id: Number(s.id ?? 0),
    title: s.title ?? "Untitled service",
    description: s.description ?? null,
    category_id: Number(s.category_id ?? 0),
    category_slug: s.category_slug ?? "other",
    category_name: s.category_name ?? "Other",
    category_icon: s.category_icon ?? null,
    price_minor: toMinor(s.price_minor),
    currency: oneOf<Currency>(s.currency, CURRENCIES, "AUD"),
    country_name: s.country_name ?? null,
    city_name: s.city_name ?? null,
    cover_url: s.cover_url ?? null,
    avg_rating: Number(s.avg_rating ?? 0),
    total_reviews: Number(s.total_reviews ?? 0),
    total_orders: Number(s.total_orders ?? 0),
    provider_id: Number(s.provider_id ?? 0),
    provider_name: s.provider_name?.trim() || "A student",
    provider_photo_url: s.provider_photo_url ?? null,
    created_at: s.created_at ?? new Date().toISOString(),
  };
}

export const servicesRealApi = {
  getMeta: async (): Promise<ServicesMeta> => {
    const raw = await httpGet<Partial<ServicesMeta>>(`${BASE}/meta`);
    return {
      categories: usableCategories(raw?.categories),
      currencies: (() => {
        const c = toArray<Currency>(raw?.currencies);
        return c.length ? c : [...CURRENCIES];
      })(),
      cover_upload_available: raw?.cover_upload_available === true,
      payments_live: raw?.payments_live === true,
    };
  },

  // ── Public marketplace. No token required; these are the only unauthenticated calls in the feature. ──

  browse: async (filters: BrowseFilters = {}): Promise<BrowseResult> => {
    const params = new URLSearchParams();
    if (filters.search) params.set("search", filters.search);
    if (filters.category_id) params.set("category_id", String(filters.category_id));
    if (filters.country_id) params.set("country_id", String(filters.country_id));
    if (filters.city_id) params.set("city_id", String(filters.city_id));
    if (filters.currency) params.set("currency", filters.currency);
    if (filters.min_price !== undefined) params.set("min_price", String(filters.min_price));
    if (filters.max_price !== undefined) params.set("max_price", String(filters.max_price));
    if (filters.page) params.set("page", String(filters.page));
    if (filters.limit) params.set("limit", String(filters.limit));
    const qs = params.toString();

    const raw = await httpGet<Partial<BrowseResult>>(`${PUBLIC}${qs ? `?${qs}` : ""}`);
    return {
      services: toArray<Partial<PublicService>>(raw?.services).map(normalizePublicService),
      meta: {
        page: Number(raw?.meta?.page ?? 1),
        limit: Number(raw?.meta?.limit ?? 12),
        total: Number(raw?.meta?.total ?? 0),
        totalPages: Number(raw?.meta?.totalPages ?? 1),
      },
    };
  },

  getPublicService: async (serviceId: number): Promise<PublicService> =>
    normalizePublicService(await httpGet<Partial<PublicService>>(`${PUBLIC}/${serviceId}`)),

  getPublicReviews: async (serviceId: number): Promise<PublicReview[]> => {
    const raw = await httpGet<{ reviews?: PublicReview[] }>(`${PUBLIC}/${serviceId}/reviews`);
    return toArray<PublicReview>(raw?.reviews);
  },

  getPublicCategories: async (): Promise<ServiceCategory[]> => {
    const raw = await httpGet<{ categories?: Partial<ServiceCategory>[] }>(`${PUBLIC}/categories`);
    return usableCategories(raw?.categories);
  },

  // ── Buying ──

  createOrder: async (listingId: number, notes?: string | null): Promise<Order> =>
    normalizeOrder(await httpPost<Partial<Order>>(`${BASE}/orders`, { listing_id: listingId, notes: notes ?? null })),

  startCheckout: async (orderId: number): Promise<CheckoutSession> => {
    const raw = await httpPost<Partial<CheckoutSession>>(`${BASE}/orders/${orderId}/checkout`, {});
    if (!raw?.url) throw new Error("Checkout did not return a payment URL");
    return { url: raw.url, session_id: raw.session_id ?? "" };
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

  disputeOrder: async (orderId: number, reason: string): Promise<Order> =>
    normalizeOrder(await httpPost<Partial<Order>>(`${BASE}/orders/${orderId}/dispute`, { reason })),

  cancelOrder: async (orderId: number): Promise<Order> =>
    normalizeOrder(await httpPost<Partial<Order>>(`${BASE}/orders/${orderId}/cancel`, {})),

  refundOrder: async (orderId: number): Promise<Order> =>
    normalizeOrder(await httpPost<Partial<Order>>(`${BASE}/orders/${orderId}/refund`, {})),

  // ── Order thread ──

  getMessages: async (orderId: number): Promise<OrderMessage[]> => {
    const raw = await httpGet<{ messages?: OrderMessage[] }>(`${BASE}/orders/${orderId}/messages`);
    return toArray<Partial<OrderMessage>>(raw?.messages).map(normalizeMessage);
  },

  sendMessage: async (orderId: number, body: string): Promise<OrderMessage> =>
    normalizeMessage(await httpPost<Partial<OrderMessage>>(`${BASE}/orders/${orderId}/messages`, { body })),

  // ── Reviews ──
  //
  // Keyed on the listing, not the order: reviewing does not require having bought.

  getMyReview: async (serviceId: number): Promise<MyReviewState> => {
    const raw = await httpGet<Partial<MyReviewState>>(`${BASE}/listings/${serviceId}/my-review`);
    return {
      // Default false: a missing field must never offer a form the server would refuse.
      can_review: raw?.can_review === true,
      reason: raw?.reason ?? null,
      review: raw?.review ?? null,
    };
  },

  createReview: (serviceId: number, input: { rating: number; comment?: string | null }): Promise<Review> =>
    httpPost<Review>(`${BASE}/listings/${serviceId}/reviews`, input),

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
