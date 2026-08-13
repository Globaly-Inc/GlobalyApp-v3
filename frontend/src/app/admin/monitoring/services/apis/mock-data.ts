import type { AdminServiceListing, AdminServiceOrder, AdminServicesStats, Paginated } from "./types";

const delay = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));

const LISTINGS: AdminServiceListing[] = [
  {
    id: 1,
    title: "Airport Pickup — Sydney",
    price_minor: 5000,
    currency: "AUD",
    is_active: true,
    avg_rating: 4.5,
    total_reviews: 2,
    total_orders: 3,
    created_at: "2026-08-01T09:00:00.000Z",
    deleted_at: null,
    category_name: "Airport Pickup",
    provider_id: 2,
    provider_name: "Wonjala Joshi",
    provider_email: "wonjala.joshi@globalyhub.com",
  },
  {
    id: 2,
    title: "Assignment Help — Statistics",
    price_minor: 3500,
    currency: "GBP",
    is_active: false,
    avg_rating: 0,
    total_reviews: 0,
    total_orders: 0,
    created_at: "2026-08-03T09:00:00.000Z",
    deleted_at: null,
    category_name: "Assignment Help",
    provider_id: 3,
    provider_name: "Marco Demo",
    provider_email: "demo-seller@globaly.test",
  },
];

const ORDERS: AdminServiceOrder[] = [
  {
    id: 1,
    amount_minor: 5000,
    currency: "AUD",
    status: "paid",
    created_at: "2026-08-05T09:00:00.000Z",
    paid_at: "2026-08-05T09:05:00.000Z",
    completed_at: null,
    payment_provider: "dev",
    payment_refund_id: null,
    listing_title: "Airport Pickup — Sydney",
    buyer_name: "Priya Demo",
    provider_name: "Wonjala Joshi",
  },
  {
    id: 2,
    amount_minor: 3500,
    currency: "GBP",
    status: "completed",
    created_at: "2026-08-06T09:00:00.000Z",
    paid_at: "2026-08-06T09:05:00.000Z",
    completed_at: "2026-08-07T10:00:00.000Z",
    payment_provider: "dev",
    payment_refund_id: null,
    listing_title: "Assignment Help — Statistics",
    buyer_name: "Priya Demo",
    provider_name: "Marco Demo",
  },
];

const page = <T,>(data: T[]): Paginated<T> => ({
  data,
  meta: { page: 1, limit: 20, total: data.length, totalPages: 1 },
});

export const adminServicesMockApi = {
  getStats: async (): Promise<AdminServicesStats> => {
    console.log("[mock] admin getStats");
    await delay();
    return {
      listings: { total: 2, active: 1, paused: 1 },
      orders: [
        { currency: "AUD", orders_count: 1, held_minor: 5000, completed_minor: 0 },
        { currency: "GBP", orders_count: 1, held_minor: 0, completed_minor: 3500 },
      ],
    };
  },

  getListings: async (params: { search?: string; status?: string; page?: number } = {}) => {
    console.log("[mock] admin getListings", params);
    await delay();
    return page(LISTINGS);
  },

  getOrders: async (params: { status?: string; page?: number } = {}) => {
    console.log("[mock] admin getOrders", params);
    await delay();
    return page(ORDERS);
  },
};
