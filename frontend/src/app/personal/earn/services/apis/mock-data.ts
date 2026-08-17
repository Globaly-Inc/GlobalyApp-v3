// Mock API — same method names as real-api, so createApi can swap them with no call-site change.
// Enabled by NEXT_PUBLIC_MOCK_DATA (default on). Every write mutates the in-memory arrays below so the UI
// behaves like a real backend while the flag is set.

import type {
  BrowseFilters,
  BrowseResult,
  CheckoutSession,
  City,
  Listing,
  ListingInput,
  Order,
  PublicReview,
  MyReviewState,
  BookingAnswerValue,
  BookingDetails,
  OrderMessage,
  PublicService,
  Review,
  ServiceCategory,
  ServicesMeta,
  Summary,
  UploadedCover,
  VerifyPaymentResult,
} from "./types";
import { CURRENCIES } from "./types";

const delay = (ms = 350) => new Promise((resolve) => setTimeout(resolve, ms));

// Mirrors what migration 20260813_001 seeds into service_categories.
const MOCK_CATEGORIES: ServiceCategory[] = [
  { id: 1, slug: "airport_pickup", name: "Airport Pickup" },
  { id: 2, slug: "city_orientation", name: "City Orientation" },
  { id: 3, slug: "rental_support", name: "Rental Support" },
  { id: 4, slug: "employment_support", name: "Employment Setup & Support" },
  { id: 5, slug: "assignment_help", name: "Assignment Help" },
  { id: 6, slug: "private_tutoring", name: "Private Tutoring" },
  { id: 7, slug: "other", name: "Other" },
];

const listing = (over: Partial<Listing> & { id: number; title: string }): Listing => ({
  provider_id: 1,
  description: null,
  category_id: 7,
  category_slug: "other",
  category_name: "Other",
  category_icon: "Package",
  price_minor: 5000,
  currency: "AUD",
  country_id: null,
  country_name: null,
  city_id: null,
  city_name: null,
  cover_storage_path: null,
  cover_url: null,
  is_active: true,
  avg_rating: 0,
  total_reviews: 0,
  total_orders: 0,
  open_orders_count: 0,
  created_at: "2026-08-01T09:00:00.000Z",
  updated_at: "2026-08-01T09:00:00.000Z",
  ...over,
});

const order = (over: Partial<Order> & { id: number; listing_title: string }): Order => ({
  listing_id: 1,
  listing_deleted: false,
  amount_minor: 5000,
  currency: "AUD",
  status: "paid",
  role: "provider",
  counterparty_name: "Priya Demo",
  message_count: 0,
  has_review: false,
  notes: null,
  payment_refund_id: null,
  created_at: "2026-08-05T09:00:00.000Z",
  paid_at: "2026-08-05T09:05:00.000Z",
  cancelled_at: null,
  refunded_at: null,
  ...over,
});

let listings: Listing[] = [
  listing({
    id: 1,
    title: "Airport Pickup — Sydney",
    category_id: 1,
    category_slug: "airport_pickup",
    category_name: "Airport Pickup",
    category_icon: "Plane",
    price_minor: 5000,
    city_name: "Sydney",
    country_name: "Australia",
    avg_rating: 4.5,
    total_reviews: 2,
    total_orders: 3,
    open_orders_count: 2,
  }),
  listing({
    id: 2,
    title: "Assignment Help — Statistics",
    category_id: 5,
    category_slug: "assignment_help",
    category_name: "Assignment Help",
    category_icon: "FileText",
    price_minor: 3500,
    currency: "GBP",
    is_active: false,
  }),
];

let purchases: Order[] = [
  order({ id: 11, listing_title: "Rental Support — Inner West", role: "buyer", amount_minor: 12000, message_count: 2 }),
  order({
    id: 12,
    listing_title: "City Orientation — Melbourne CBD",
    role: "buyer",
    amount_minor: 2500,
    status: "refunded",
    refunded_at: "2026-08-07T10:00:00.000Z",
    payment_refund_id: "re_mock_123",
  }),
];

let received: Order[] = [
  order({ id: 21, listing_title: "Airport Pickup — Sydney", message_count: 1 }),
  order({ id: 22, listing_title: "Airport Pickup — Sydney", status: "pending_payment", paid_at: null }),
];

/** Keyed by listing id now, not order id — a review belongs to the service, not to a purchase. */
const reviews = new Map<number, Review>();
/** Order id -> its thread. */
const threads = new Map<number, OrderMessage[]>();
/** Order id -> what the buyer answered. */
const bookings = new Map<number, BookingDetails>();
let nextId = 100;

const allOrders = () => [...purchases, ...received];

/** The seller's row, narrowed to what a buyer is allowed to see. */
const toPublic = (l: Listing): PublicService => ({
  id: l.id,
  title: l.title,
  description: l.description,
  category_id: l.category_id,
  category_icon: l.category_icon,
  booking_fields: [],
  category_slug: l.category_slug,
  category_name: l.category_name,
  price_minor: l.price_minor,
  currency: l.currency,
  country_name: l.country_name,
  city_name: l.city_name,
  cover_url: l.cover_url,
  avg_rating: l.avg_rating,
  total_reviews: l.total_reviews,
  total_orders: l.total_orders,
  provider_id: l.provider_id,
  provider_name: "Marco Demo",
  provider_photo_url: null,
  created_at: l.created_at,
});

/** Derived fields the server owns. Nothing closes an order any more, so status is left alone. */
function recompute(o: Order): Order {
  return {
    ...o,
    message_count: (threads.get(o.id) ?? []).length || o.message_count,
    has_review: reviews.has(o.listing_id),
  };
}

function mutate(orderId: number, change: (o: Order) => Order): Order {
  let result: Order | undefined;
  const apply = (list: Order[]) =>
    list.map((o) => {
      if (o.id !== orderId) return o;
      result = recompute(change(o));
      return result;
    });
  purchases = apply(purchases);
  received = apply(received);
  if (!result) throw new Error("Order not found");
  return result;
}

export const servicesMockApi = {
  getMeta: async (): Promise<ServicesMeta> => {
    console.log("[mock] getMeta");
    await delay(100);
    return {
      categories: MOCK_CATEGORIES,
      currencies: [...CURRENCIES],
      cover_upload_available: true,
      payments_live: false,
    };
  },

  getSummary: async (): Promise<Summary> => {
    console.log("[mock] getSummary");
    await delay();
    return {
      totals: [
        { currency: "AUD", held_minor: 10000, refunded_minor: 2500, orders_count: 3 },
        { currency: "GBP", held_minor: 0, refunded_minor: 3500, orders_count: 1 },
      ],
      listings_count: listings.length,
      purchases_count: purchases.length,
      received_count: received.length,
      payouts_live: false,
    };
  },

  getListings: async (): Promise<Listing[]> => {
    console.log("[mock] getListings");
    await delay();
    return [...listings];
  },

  getListing: async (serviceId: number): Promise<Listing> => {
    console.log("[mock] getListing", serviceId);
    await delay();
    const found = listings.find((l) => l.id === serviceId);
    if (!found) throw new Error("Service listing not found");
    return found;
  },

  createListing: async (input: ListingInput): Promise<Listing> => {
    console.log("[mock] createListing", input);
    await delay();
    const created = listing({ ...input, id: ++nextId, title: input.title, description: input.description ?? null });
    listings = [created, ...listings];
    return created;
  },

  updateListing: async (serviceId: number, input: Partial<ListingInput>): Promise<Listing> => {
    console.log("[mock] updateListing", serviceId, input);
    await delay();
    let updated: Listing | undefined;
    listings = listings.map((l) => (l.id === serviceId ? (updated = { ...l, ...input }) : l));
    if (!updated) throw new Error("Service listing not found");
    return updated;
  },

  deleteListing: async (serviceId: number): Promise<void> => {
    console.log("[mock] deleteListing", serviceId);
    await delay();
    const target = listings.find((l) => l.id === serviceId);
    // Mirrors the server's 409 so the blocked-delete path is reachable under mock data too.
    if (target && target.open_orders_count > 0) {
      throw new Error(
        `This listing has ${target.open_orders_count} open orders. Pause it instead — deleting it now would strand payments.`,
      );
    }
    listings = listings.filter((l) => l.id !== serviceId);
  },

  uploadCover: async (file: File): Promise<UploadedCover> => {
    console.log("[mock] uploadCover", file.name);
    await delay(600);
    return { storage_path: `mock/${file.name}`, url: URL.createObjectURL(file) };
  },

  getPurchases: async (): Promise<Order[]> => {
    console.log("[mock] getPurchases");
    await delay();
    return purchases.map(recompute);
  },

  getReceivedOrders: async (): Promise<Order[]> => {
    console.log("[mock] getReceivedOrders");
    await delay();
    return received.map(recompute);
  },

  getOrder: async (orderId: number): Promise<Order> => {
    console.log("[mock] getOrder", orderId);
    await delay();
    const found = allOrders().find((o) => o.id === orderId);
    if (!found) throw new Error("Order not found");
    return recompute(found);
  },

  verifyPayment: async (sessionId: string): Promise<VerifyPaymentResult> => {
    console.log("[mock] verifyPayment", sessionId);
    await delay(700);
    if (!sessionId.startsWith("dev_") && !sessionId.startsWith("cs_")) {
      throw new Error("The amount paid does not match this order");
    }
    return { success: true, order_id: 11, already_verified: false };
  },

  disputeOrder: async (orderId: number, reason: string): Promise<Order> => {
    console.log("[mock] disputeOrder", orderId, reason);
    await delay();
    return mutate(orderId, (o) => ({ ...o, status: "disputed", notes: `Problem reported: ${reason}` }));
  },

  cancelOrder: async (orderId: number): Promise<Order> => {
    console.log("[mock] cancelOrder", orderId);
    await delay();
    return mutate(orderId, (o) => ({ ...o, status: "cancelled", cancelled_at: new Date().toISOString() }));
  },

  refundOrder: async (orderId: number): Promise<Order> => {
    console.log("[mock] refundOrder", orderId);
    await delay();
    return mutate(orderId, (o) => ({
      ...o,
      status: "refunded",
      refunded_at: new Date().toISOString(),
      payment_refund_id: "re_mock_123",
    }));
  },

  getMessages: async (orderId: number): Promise<OrderMessage[]> => {
    console.log("[mock] getMessages", orderId);
    await delay(150);
    return threads.get(orderId) ?? [];
  },

  sendMessage: async (orderId: number, body: string): Promise<OrderMessage> => {
    console.log("[mock] sendMessage", orderId, body);
    await delay(200);
    const message: OrderMessage = {
      id: ++nextId,
      body,
      created_at: new Date().toISOString(),
      sender_id: 1,
      sender_name: "You",
      is_mine: true,
    };
    threads.set(orderId, [...(threads.get(orderId) ?? []), message]);
    mutate(orderId, (o) => o);
    return message;
  },

  getMyReview: async (serviceId: number): Promise<MyReviewState> => {
    console.log("[mock] getMyReview", serviceId);
    await delay(150);
    const mine = reviews.get(serviceId) ?? null;
    return { can_review: mine === null, reason: mine ? "already_reviewed" : null, review: mine };
  },

  createReview: async (serviceId: number, input: { rating: number; comment?: string | null }): Promise<Review> => {
    console.log("[mock] createReview", serviceId, input);
    await delay();
    const review: Review = {
      id: ++nextId,
      order_id: null,
      listing_id: serviceId,
      rating: input.rating,
      comment: input.comment ?? null,
      is_verified_purchase: false,
      created_at: new Date().toISOString(),
    };
    reviews.set(serviceId, review);
    return review;
  },

  // ── Public marketplace ──

  browse: async (filters: BrowseFilters = {}): Promise<BrowseResult> => {
    console.log("[mock] browse", filters);
    await delay();
    const visible = listings.filter((l) => l.is_active);
    const matched = visible.filter(
      (l) =>
        (!filters.search || l.title.toLowerCase().includes(filters.search.toLowerCase())) &&
        (!filters.category_id || l.category_id === filters.category_id) &&
        (!filters.currency || l.currency === filters.currency),
    );
    return {
      services: matched.map(toPublic),
      meta: { page: 1, limit: 12, total: matched.length, totalPages: 1 },
    };
  },

  getPublicService: async (serviceId: number): Promise<PublicService> => {
    console.log("[mock] getPublicService", serviceId);
    await delay();
    const found = listings.find((l) => l.id === serviceId && l.is_active);
    if (!found) throw new Error("Service not found");
    return toPublic(found);
  },

  getPublicReviews: async (serviceId: number): Promise<PublicReview[]> => {
    console.log("[mock] getPublicReviews", serviceId);
    await delay(150);
    return [...reviews.values()]
      .filter((r) => r.listing_id === serviceId)
      .map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        created_at: r.created_at,
        reviewer_name: "Priya Demo",
        reviewer_photo_url: null,
        is_verified_purchase: r.is_verified_purchase,
      }));
  },

  getPublicCategories: async (): Promise<ServiceCategory[]> => {
    console.log("[mock] getPublicCategories");
    await delay(120);
    return MOCK_CATEGORIES;
  },

  createOrder: async (
    listingId: number,
    input: { answers?: Record<string, BookingAnswerValue>; note?: string | null } = {},
  ): Promise<Order> => {
    console.log("[mock] createOrder", listingId, input);
    await delay();
    const listing = listings.find((l) => l.id === listingId);
    if (!listing) throw new Error("Service listing not found");
    bookings.set(nextId + 1, {
      answers: Object.entries(input.answers ?? {}).map(([key, value]) => ({
        key,
        label: key,
        value: String(value),
      })),
      note: input.note ?? null,
      decline_reason: null,
    });
    const created = order({
      id: ++nextId,
      listing_id: listing.id,
      listing_title: listing.title,
      role: "buyer",
      // A request, not a purchase — the seller has to accept before this is payable.
      status: "requested",
      paid_at: null,
      amount_minor: listing.price_minor,
      currency: listing.currency,
      notes: null,
    });
    purchases = [created, ...purchases];
    return created;
  },

  startCheckout: async (orderId: number): Promise<CheckoutSession> => {
    console.log("[mock] startCheckout", orderId);
    await delay(400);
    const session = `dev_paid_mock_${orderId}`;
    return { url: `/personal/earn/services/payment-success?session_id=${session}`, session_id: session };
  },

  getCities: async (countryId: number): Promise<City[]> => {
    console.log("[mock] getCities", countryId);
    await delay(200);
    return [
      { id: 1, name: "Sydney" },
      { id: 2, name: "Melbourne" },
      { id: 3, name: "Brisbane" },
    ];
  },

  // ── The booking handshake ──

  getBooking: async (orderId: number): Promise<BookingDetails> => {
    console.log("[mock] getBooking", orderId);
    await delay(150);
    return bookings.get(orderId) ?? { answers: [], note: null, decline_reason: null };
  },

  acceptBooking: async (orderId: number): Promise<Order> => {
    console.log("[mock] acceptBooking", orderId);
    await delay();
    return mutate(orderId, (o) => ({ ...o, status: "pending_payment" }));
  },

  declineBooking: async (orderId: number, reason: string): Promise<Order> => {
    console.log("[mock] declineBooking", orderId, reason);
    await delay();
    const existing = bookings.get(orderId);
    if (existing) bookings.set(orderId, { ...existing, decline_reason: reason });
    return mutate(orderId, (o) => ({ ...o, status: "declined" }));
  },

  startWork: async (orderId: number): Promise<Order> => {
    console.log("[mock] startWork", orderId);
    await delay();
    return mutate(orderId, (o) => ({ ...o, status: "in_progress" }));
  },

  finishWork: async (orderId: number): Promise<Order> => {
    console.log("[mock] finishWork", orderId);
    await delay();
    return mutate(orderId, (o) => ({ ...o, status: "completed" }));
  },

};
