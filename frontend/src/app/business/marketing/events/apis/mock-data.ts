import type {
  EventItem,
  EventInput,
  PaginatedResult,
  TicketItem,
  TicketInput,
  RegistrationItem,
  RegistrationInput,
  CoHostItem,
  UpdateItem,
} from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
}

let nextEventId = 3;
let nextTicketId = 3;
let nextRegistrationId = 3;
let nextCoHostId = 1;
let nextUpdateId = 1;

let mockEvents: EventItem[] = [
  {
    id: 1,
    created_by: 1,
    title: "Open Day 2026",
    slug: "open-day-2026",
    description: "Meet our faculty and tour the campus.",
    event_type: "in_person",
    status: "published",
    visibility: "public",
    target_audiences: ["prospective_students"],
    venue_name: "Main Campus Hall",
    venue_address: "123 University Ave",
    venue_city: "Sydney",
    venue_country: "Australia",
    online_url: null,
    online_platform: null,
    starts_at: daysFromNow(14),
    ends_at: daysFromNow(14),
    timezone: "Australia/Sydney",
    max_capacity: 200,
    registration_deadline: daysFromNow(12),
    contact_email: "events@example.edu",
    contact_phone: null,
    rsvp_count: 42,
    published_at: daysFromNow(-3),
    cancelled_at: null,
    cancellation_reason: null,
    created_at: daysFromNow(-10),
    updated_at: daysFromNow(-3),
  },
  {
    id: 2,
    created_by: 1,
    title: "Virtual Info Session",
    slug: "virtual-info-session",
    description: "Live Q&A about our postgraduate programmes.",
    event_type: "online",
    status: "draft",
    visibility: "public",
    target_audiences: [],
    venue_name: null,
    venue_address: null,
    venue_city: null,
    venue_country: null,
    online_url: "https://meet.example.com/info-session",
    online_platform: "Zoom",
    starts_at: daysFromNow(21),
    ends_at: daysFromNow(21),
    timezone: "UTC",
    max_capacity: null,
    registration_deadline: null,
    contact_email: null,
    contact_phone: null,
    rsvp_count: 0,
    published_at: null,
    cancelled_at: null,
    cancellation_reason: null,
    created_at: daysFromNow(-1),
    updated_at: daysFromNow(-1),
  },
];

let mockTickets: TicketItem[] = [
  { id: 1, event_id: 1, name: "General Admission", description: null, price: "0.00", currency: "USD", quantity: 200, sold_count: 42, max_per_order: 4, is_active: true, sort_order: 0 },
];

let mockRegistrations: RegistrationItem[] = [
  { id: 1, event_id: 1, ticket_id: 1, ticket_name: "General Admission", registrant_name: "Priya Sharma", registrant_email: "priya@example.com", registrant_phone: null, status: "registered", quantity: 1, notes: null, checked_in_at: null, cancelled_at: null, created_at: daysFromNow(-2) },
  { id: 2, event_id: 1, ticket_id: 1, ticket_name: "General Admission", registrant_name: "Daniel Okafor", registrant_email: "daniel@example.com", registrant_phone: null, status: "checked_in", quantity: 1, notes: null, checked_in_at: daysFromNow(-1), cancelled_at: null, created_at: daysFromNow(-4) },
];

let mockCoHosts: CoHostItem[] = [];
let mockUpdates: UpdateItem[] = [];

function log(msg: string, meta?: unknown) {
  console.log(`[mock] ${msg}`, meta ?? "");
}

export const businessEventsMockApi = {
  list: async (params: { page?: number; limit?: number; status?: string; search?: string } = {}): Promise<PaginatedResult<EventItem>> => {
    log("GET /business-events", params);
    await delay(200);
    let rows = mockEvents;
    if (params.status) rows = rows.filter((e) => e.status === params.status);
    if (params.search) rows = rows.filter((e) => e.title.toLowerCase().includes(params.search!.toLowerCase()));
    return { data: rows, meta: { page: 1, limit: 50, total: rows.length, totalPages: 1 } };
  },

  get: async (id: number): Promise<EventItem> => {
    log("GET /business-events/:id", { id });
    await delay(150);
    const found = mockEvents.find((e) => e.id === id);
    if (!found) throw new Error("Event not found");
    return found;
  },

  create: async (input: EventInput): Promise<EventItem> => {
    log("POST /business-events", input);
    await delay(250);
    const created: EventItem = {
      ...input,
      id: ++nextEventId,
      created_by: 1,
      slug: input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      rsvp_count: 0,
      published_at: input.status === "published" ? new Date().toISOString() : null,
      cancelled_at: null,
      cancellation_reason: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    mockEvents = [created, ...mockEvents];
    return created;
  },

  update: async (id: number, input: Partial<EventInput>): Promise<EventItem> => {
    log("PATCH /business-events/:id", { id, input });
    await delay(250);
    let updated: EventItem | undefined;
    mockEvents = mockEvents.map((e) => {
      if (e.id !== id) return e;
      updated = { ...e, ...input, updated_at: new Date().toISOString() };
      return updated;
    });
    if (!updated) throw new Error("Event not found");
    return updated;
  },

  cancel: async (id: number, reason?: string): Promise<EventItem> => {
    log("POST /business-events/:id/cancel", { id, reason });
    await delay(200);
    let updated: EventItem | undefined;
    mockEvents = mockEvents.map((e) => {
      if (e.id !== id) return e;
      updated = { ...e, status: "cancelled", cancelled_at: new Date().toISOString(), cancellation_reason: reason ?? null };
      return updated;
    });
    if (!updated) throw new Error("Event not found");
    return updated;
  },

  remove: async (id: number): Promise<void> => {
    log("DELETE /business-events/:id", { id });
    await delay(200);
    mockEvents = mockEvents.filter((e) => e.id !== id);
  },

  listTickets: async (eventId: number): Promise<TicketItem[]> => {
    log("GET tickets", { eventId });
    await delay(150);
    return mockTickets.filter((t) => t.event_id === eventId);
  },

  createTicket: async (eventId: number, input: TicketInput): Promise<TicketItem> => {
    await delay(200);
    const created: TicketItem = { ...input, id: ++nextTicketId, event_id: eventId, sold_count: 0 };
    mockTickets = [...mockTickets, created];
    return created;
  },

  updateTicket: async (eventId: number, ticketId: number, input: Partial<TicketInput>): Promise<TicketItem> => {
    await delay(200);
    let updated: TicketItem | undefined;
    mockTickets = mockTickets.map((t) => {
      if (t.id !== ticketId) return t;
      updated = { ...t, ...input };
      return updated;
    });
    if (!updated) throw new Error("Ticket not found");
    return updated;
  },

  deleteTicket: async (eventId: number, ticketId: number): Promise<void> => {
    await delay(150);
    mockTickets = mockTickets.filter((t) => t.id !== ticketId);
  },

  listRegistrations: async (eventId: number): Promise<RegistrationItem[]> => {
    log("GET registrations", { eventId });
    await delay(150);
    return mockRegistrations.filter((r) => r.event_id === eventId);
  },

  register: async (eventId: number, input: RegistrationInput): Promise<RegistrationItem> => {
    await delay(200);
    const ticket = mockTickets.find((t) => t.id === input.ticket_id);
    const created: RegistrationItem = {
      id: ++nextRegistrationId,
      event_id: eventId,
      ticket_id: input.ticket_id ?? null,
      ticket_name: ticket?.name ?? null,
      registrant_name: input.registrant_name,
      registrant_email: input.registrant_email,
      registrant_phone: input.registrant_phone ?? null,
      status: "registered",
      quantity: input.quantity ?? 1,
      notes: input.notes ?? null,
      checked_in_at: null,
      cancelled_at: null,
      created_at: new Date().toISOString(),
    };
    mockRegistrations = [created, ...mockRegistrations];
    mockEvents = mockEvents.map((e) => (e.id === eventId ? { ...e, rsvp_count: e.rsvp_count + created.quantity } : e));
    return created;
  },

  cancelRegistration: async (eventId: number, registrationId: number): Promise<RegistrationItem> => {
    await delay(200);
    let updated: RegistrationItem | undefined;
    mockRegistrations = mockRegistrations.map((r) => {
      if (r.id !== registrationId) return r;
      updated = { ...r, status: "cancelled", cancelled_at: new Date().toISOString() };
      return updated;
    });
    if (!updated) throw new Error("Registration not found");
    return updated;
  },

  checkIn: async (eventId: number, registrationId: number, checkIn: boolean): Promise<RegistrationItem> => {
    await delay(150);
    let updated: RegistrationItem | undefined;
    mockRegistrations = mockRegistrations.map((r) => {
      if (r.id !== registrationId) return r;
      updated = { ...r, status: checkIn ? "checked_in" : "registered", checked_in_at: checkIn ? new Date().toISOString() : null };
      return updated;
    });
    if (!updated) throw new Error("Registration not found");
    return updated;
  },

  listCoHosts: async (eventId: number): Promise<CoHostItem[]> => {
    await delay(150);
    return mockCoHosts.filter((c) => c.event_id === eventId);
  },

  inviteCoHost: async (eventId: number, hostBusinessId: number, role = "co_host"): Promise<CoHostItem> => {
    await delay(200);
    const created: CoHostItem = {
      id: ++nextCoHostId,
      event_id: eventId,
      host_business_id: hostBusinessId,
      host_business_name: `Business #${hostBusinessId}`,
      invited_by: 1,
      status: "pending",
      role,
      created_at: new Date().toISOString(),
    };
    mockCoHosts = [...mockCoHosts, created];
    return created;
  },

  respondCoHost: async (eventId: number, coHostId: number, accept: boolean): Promise<CoHostItem> => {
    await delay(150);
    let updated: CoHostItem | undefined;
    mockCoHosts = mockCoHosts.map((c) => {
      if (c.id !== coHostId) return c;
      updated = { ...c, status: accept ? "accepted" : "declined" };
      return updated;
    });
    if (!updated) throw new Error("Co-host invite not found");
    return updated;
  },

  listUpdates: async (eventId: number): Promise<UpdateItem[]> => {
    await delay(150);
    return mockUpdates.filter((u) => u.event_id === eventId);
  },

  createUpdate: async (eventId: number, title: string | null, content: string): Promise<UpdateItem> => {
    await delay(200);
    const created: UpdateItem = { id: ++nextUpdateId, event_id: eventId, author_id: 1, title, content, created_at: new Date().toISOString() };
    mockUpdates = [created, ...mockUpdates];
    return created;
  },
};
