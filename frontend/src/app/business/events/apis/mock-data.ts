import type { CreateEventInput, Event, Registrant, UpdateEventInput } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
}

let nextId = 2;
let mockEvents: Event[] = [
  {
    id: 1,
    business_id: 1,
    title: "Study in Australia — Info Session",
    description: "Live Q&A covering visa pathways and intake deadlines.",
    start_at: daysFromNow(7),
    end_at: daysFromNow(7),
    is_online: true,
    location: null,
    meeting_url: "https://meet.example.com/study-au",
    capacity: 100,
    status: "published",
    registrant_count: 34,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const mockRegistrants: Record<number, Registrant[]> = {
  1: [
    { id: 1, event_id: 1, attendee_name: "Priya Sharma", attendee_email: "priya.sharma@example.com", status: "registered", created_at: new Date().toISOString() },
    { id: 2, event_id: 1, attendee_name: "Daniel Okafor", attendee_email: "daniel.okafor@example.com", status: "registered", created_at: new Date().toISOString() },
  ],
};

export const businessEventsMockApi = {
  listEvents: async (): Promise<Event[]> => {
    console.log("[mock] GET /events/events");
    await delay(150);
    return mockEvents;
  },

  createEvent: async (input: CreateEventInput): Promise<Event> => {
    console.log("[mock] POST /events/events", input);
    await delay(200);
    const event: Event = {
      id: nextId++,
      business_id: 1,
      title: input.title,
      description: input.description ?? null,
      start_at: input.start_at,
      end_at: input.end_at ?? null,
      is_online: input.is_online,
      location: input.location ?? null,
      meeting_url: input.meeting_url ?? null,
      capacity: input.capacity ?? null,
      status: "draft",
      registrant_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    mockEvents = [event, ...mockEvents];
    return event;
  },

  updateEvent: async (eventId: number, input: UpdateEventInput): Promise<Event> => {
    console.log("[mock] PATCH /events/events/:id", { eventId, input });
    await delay(150);
    const existing = mockEvents.find((e) => e.id === eventId);
    if (!existing) throw new Error("Event not found");
    const updated = { ...existing, ...input, updated_at: new Date().toISOString() };
    mockEvents = mockEvents.map((e) => (e.id === eventId ? updated : e));
    return updated;
  },

  deleteEvent: async (eventId: number): Promise<void> => {
    console.log("[mock] DELETE /events/events/:id", { eventId });
    await delay(150);
    mockEvents = mockEvents.filter((e) => e.id !== eventId);
  },

  listRegistrants: async (eventId: number): Promise<Registrant[]> => {
    console.log("[mock] GET /events/events/:id/registrants", { eventId });
    await delay(150);
    return mockRegistrants[eventId] ?? [];
  },
};
