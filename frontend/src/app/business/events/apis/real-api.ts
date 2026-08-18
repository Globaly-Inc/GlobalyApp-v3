import { httpDelete, httpGet, httpPatch, httpPost } from "@/lib/api/http";
import type {
  BusinessEvent,
  EventInput,
  EventListParams,
  EventPatch,
  EventRegistration,
  EventTicket,
  Paginated,
  RegistrationListParams,
  RegistrationStatus,
  TicketInput,
  TicketPatch,
} from "./types";

const BASE = "/business/events";

function toArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/** Normalised at the boundary — a partial payload must not throw during render. */
function paginate<T>(raw: Partial<Paginated<T>> | undefined | null): Paginated<T> {
  return {
    data: toArray<T>(raw?.data),
    meta: {
      page: Number(raw?.meta?.page ?? 1),
      limit: Number(raw?.meta?.limit ?? 20),
      total: Number(raw?.meta?.total ?? 0),
      totalPages: Number(raw?.meta?.totalPages ?? 1),
    },
  };
}

function query(params: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") qs.set(key, String(value));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export const businessEventsRealApi = {
  getEvents: async (params: EventListParams = {}): Promise<Paginated<BusinessEvent>> =>
    paginate<BusinessEvent>(
      await httpGet<Partial<Paginated<BusinessEvent>>>(
        `${BASE}${query({ status: params.status, page: params.page })}`,
      ),
    ),

  getEvent: (eventId: number): Promise<BusinessEvent> => httpGet<BusinessEvent>(`${BASE}/${eventId}`),

  createEvent: (input: EventInput): Promise<BusinessEvent> => httpPost<BusinessEvent>(BASE, input),

  updateEvent: (eventId: number, patch: EventPatch): Promise<BusinessEvent> =>
    httpPatch<BusinessEvent>(`${BASE}/${eventId}`, patch),

  deleteEvent: (eventId: number): Promise<void> => httpDelete(`${BASE}/${eventId}`),

  getTickets: async (eventId: number): Promise<EventTicket[]> =>
    toArray<EventTicket>(await httpGet<EventTicket[]>(`${BASE}/${eventId}/tickets`)),

  createTicket: (eventId: number, input: TicketInput): Promise<EventTicket> =>
    httpPost<EventTicket>(`${BASE}/${eventId}/tickets`, input),

  updateTicket: (eventId: number, ticketId: number, patch: TicketPatch): Promise<EventTicket> =>
    httpPatch<EventTicket>(`${BASE}/${eventId}/tickets/${ticketId}`, patch),

  deleteTicket: (eventId: number, ticketId: number): Promise<void> =>
    httpDelete(`${BASE}/${eventId}/tickets/${ticketId}`),

  getRegistrations: async (
    eventId: number,
    params: RegistrationListParams = {},
  ): Promise<Paginated<EventRegistration>> =>
    paginate<EventRegistration>(
      await httpGet<Partial<Paginated<EventRegistration>>>(
        `${BASE}/${eventId}/registrations${query({ status: params.status, page: params.page })}`,
      ),
    ),

  setRegistrationStatus: (registrationId: number, status: RegistrationStatus): Promise<EventRegistration> =>
    httpPatch<EventRegistration>(`${BASE}/registrations/${registrationId}`, { status }),
};
