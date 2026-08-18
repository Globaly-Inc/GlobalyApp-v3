export interface Paginated<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface AdminEventStats {
  events: { total: number; published: number; draft: number; cancelled: number; upcoming: number };
  registrations: { total: number; checked_in: number; cancelled: number };
  tickets: { total: number; seats_claimed: number; gross_paid: number };
}

export interface EventHost {
  org_type: string;
  org_id: number;
  name: string | null;
  logo_url: string | null;
}

export interface AdminEvent {
  id: number;
  title: string;
  slug: string;
  event_type: string;
  category: string | null;
  status: string;
  visibility: string;
  venue_city: string | null;
  venue_country: string | null;
  starts_at: string;
  ends_at: string;
  max_capacity: number | null;
  views_count: number;
  created_at: string;
  host: EventHost;
  registrations_count: number;
}

export interface AdminEventRegistration {
  id: number;
  status: string;
  quantity: number;
  total_paid: string;
  payment_status: string;
  check_in_at: string | null;
  created_at: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  ticket_name: string | null;
}
