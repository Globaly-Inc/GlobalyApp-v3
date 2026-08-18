// Wire types for the host-side events API (/api/v3/business/events).
// Mirrors backend/src/modules/events/schemas/events.schema.ts and the
// serializeEvent / serializeTicket shapes in services/events.service.ts.

export interface Paginated<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export type EventType = "in_person" | "online" | "hybrid";
export type EventCategory = "networking" | "workshop" | "conference" | "open_day" | "other";
export type EventStatus = "draft" | "published" | "cancelled";
export type EventVisibility = "public" | "targeted";
export type RegistrationStatus = "registered" | "checked_in" | "cancelled";

/**
 * An event's host is a polymorphic (org_type, org_id) pair — most V1 event hosts are
 * unclaimed institutions, so `name` can legitimately be null for an event the API returns.
 */
export interface EventHost {
  org_type: string;
  org_id: number;
  name: string | null;
  logo_url: string | null;
}

export interface BusinessEvent {
  id: number;
  title: string;
  slug: string;
  summary: string | null;
  description: string | null;
  cover_image_url: string | null;
  event_type: EventType;
  category: EventCategory | null;
  status: EventStatus;
  visibility: EventVisibility;
  target_audiences: string[] | null;
  target_countries: string[] | null;
  venue_name: string | null;
  venue_city: string | null;
  venue_country: string | null;
  online_url: string | null;
  starts_at: string;
  ends_at: string;
  max_capacity: number | null;
  registration_deadline: string | null;
  is_featured: boolean;
  views_count: number;
  published_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
  host: EventHost;
}

export interface EventTicket {
  id: number;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  is_free: boolean;
  /** null = unlimited capacity. */
  quantity: number | null;
  /** Seats taken at checkout — reservations as well as completed sales, never "sold". */
  claimed_count: number;
  /** null = unlimited. */
  remaining: number | null;
  max_per_order: number;
  sale_starts_at: string | null;
  sale_ends_at: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface EventRegistration {
  id: number;
  status: RegistrationStatus;
  quantity: number;
  total_paid: string;
  payment_status: string;
  check_in_at: string | null;
  created_at: string;
  attendee_id: number | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  ticket_name: string | null;
}

/** Body of POST /business/events. The schema is `.strict()` — no extra keys. */
export interface EventInput {
  title: string;
  summary?: string | null;
  description?: string | null;
  cover_image_url?: string | null;
  event_type: EventType;
  category?: EventCategory | null;
  status: EventStatus;
  visibility: EventVisibility;
  venue_name?: string | null;
  venue_address?: string | null;
  venue_city?: string | null;
  venue_country?: string | null;
  online_url?: string | null;
  online_platform?: string | null;
  starts_at: string;
  ends_at: string;
  timezone?: string | null;
  max_capacity?: number | null;
  registration_deadline?: string | null;
  tags?: string[] | null;
  contact_email?: string | null;
  contact_phone?: string | null;
}

/** Body of PATCH /business/events/:id — every create field is optional here. */
export type EventPatch = Partial<EventInput> & { cancellation_reason?: string | null };

export interface TicketInput {
  name: string;
  description?: string | null;
  price: number;
  currency: string;
  quantity?: number | null;
  max_per_order: number;
  sale_starts_at?: string | null;
  sale_ends_at?: string | null;
  is_active: boolean;
  sort_order: number;
}

export type TicketPatch = Partial<TicketInput>;

export interface EventListParams {
  status?: EventStatus | "";
  page?: number;
}

export interface RegistrationListParams {
  status?: RegistrationStatus | "";
  page?: number;
}
