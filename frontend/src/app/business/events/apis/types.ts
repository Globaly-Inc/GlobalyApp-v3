// Wire types for /api/v3/events/*. Matches backend/src/modules/events/schemas + repositories.

export type EventStatus = "draft" | "published" | "cancelled";

export type Event = {
  id: number;
  business_id: number;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  is_online: boolean;
  location: string | null;
  meeting_url: string | null;
  capacity: number | null;
  status: EventStatus;
  registrant_count: number;
  created_at: string;
  updated_at: string;
};

export type CreateEventInput = {
  title: string;
  description?: string | null;
  start_at: string;
  end_at?: string | null;
  is_online: boolean;
  location?: string | null;
  meeting_url?: string | null;
  capacity?: number | null;
};

export type UpdateEventInput = Partial<CreateEventInput> & { status?: EventStatus };

export type Registrant = {
  id: number;
  event_id: number;
  attendee_name: string;
  attendee_email: string;
  status: "registered" | "cancelled";
  created_at: string;
};
