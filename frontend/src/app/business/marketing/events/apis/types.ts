// Wire types — matches backend/src/modules/business-events/schemas/events.schema.ts.
// No payment fields: tickets are bookkeeping only, registrations are free RSVPs.

export type EventStatus = "draft" | "published" | "cancelled" | "completed";
export type EventVisibility = "public" | "members" | "invite_only";
export type EventType = "in_person" | "online" | "hybrid";
export type RegistrationStatus = "registered" | "checked_in" | "cancelled";
export type CoHostStatus = "pending" | "accepted" | "declined";

export type EventItem = {
  id: number;
  created_by: number | null;
  title: string;
  slug: string;
  description: string | null;
  event_type: EventType;
  status: EventStatus;
  visibility: EventVisibility;
  target_audiences: string[];
  venue_name: string | null;
  venue_address: string | null;
  venue_city: string | null;
  venue_country: string | null;
  online_url: string | null;
  online_platform: string | null;
  starts_at: string;
  ends_at: string;
  timezone: string | null;
  max_capacity: number | null;
  registration_deadline: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  rsvp_count: number;
  published_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type EventInput = Omit<
  EventItem,
  | "id"
  | "created_by"
  | "slug"
  | "rsvp_count"
  | "published_at"
  | "cancelled_at"
  | "cancellation_reason"
  | "created_at"
  | "updated_at"
>;

export type PaginatedResult<T> = {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};

export type TicketItem = {
  id: number;
  event_id: number;
  name: string;
  description: string | null;
  price: string;
  currency: string;
  quantity: number | null;
  sold_count: number;
  max_per_order: number;
  is_active: boolean;
  sort_order: number;
};

export type TicketInput = Omit<TicketItem, "id" | "event_id" | "sold_count">;

export type RegistrationItem = {
  id: number;
  event_id: number;
  ticket_id: number | null;
  ticket_name: string | null;
  registrant_name: string;
  registrant_email: string;
  registrant_phone: string | null;
  status: RegistrationStatus;
  quantity: number;
  notes: string | null;
  checked_in_at: string | null;
  cancelled_at: string | null;
  created_at: string;
};

export type RegistrationInput = {
  ticket_id?: number | null;
  registrant_name: string;
  registrant_email: string;
  registrant_phone?: string | null;
  quantity?: number;
  notes?: string | null;
};

export type CoHostItem = {
  id: number;
  event_id: number;
  host_business_id: number;
  host_business_name: string;
  invited_by: number | null;
  status: CoHostStatus;
  role: string;
  created_at: string;
};

export type UpdateItem = {
  id: number;
  event_id: number;
  author_id: number | null;
  title: string | null;
  content: string;
  created_at: string;
};
