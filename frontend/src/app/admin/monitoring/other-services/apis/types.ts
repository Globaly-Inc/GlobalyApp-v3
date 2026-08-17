// Wire types for the admin's read-only view of Earn → My Services ("Other Services").

export interface AdminServiceListing {
  id: number;
  title: string;
  /** An admin looking into a listing should be able to read what is actually being sold. */
  description: string | null;
  price_minor: number;
  currency: string;
  is_active: boolean;
  avg_rating: string | number;
  total_reviews: number;
  total_orders: number;
  created_at: string;
  deleted_at: string | null;
  category_name: string;
  provider_id: number;
  provider_name: string;
  provider_email: string;
}

export interface AdminServiceOrder {
  id: number;
  amount_minor: number;
  currency: string;
  status: string;
  created_at: string;
  paid_at: string | null;
  completed_at: string | null;
  payment_provider: string | null;
  payment_refund_id: string | null;
  listing_title: string;
  buyer_name: string;
  provider_name: string;
}

export interface AdminServicesStats {
  listings: { total: number; active: number; paused: number };
  /** Per currency, never summed across them — nothing in this feature converts. */
  orders: { currency: string; orders_count: number; held_minor: number; completed_minor: number }[];
}

export interface Paginated<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}
