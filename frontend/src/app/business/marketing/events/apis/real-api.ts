import { httpGet, httpPost, httpPatch, httpDelete } from "@/lib/api/http";
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

export const businessEventsRealApi = {
  list: (params: { page?: number; limit?: number; status?: string; search?: string } = {}): Promise<PaginatedResult<EventItem>> => {
    const q = new URLSearchParams();
    if (params.page) q.set("page", String(params.page));
    q.set("limit", String(params.limit ?? 50));
    if (params.status) q.set("status", params.status);
    if (params.search) q.set("search", params.search);
    return httpGet(`/business-events?${q.toString()}`);
  },

  get: (id: number): Promise<EventItem> => httpGet(`/business-events/${id}`),

  create: (input: EventInput): Promise<EventItem> => httpPost("/business-events", input),

  update: (id: number, input: Partial<EventInput>): Promise<EventItem> => httpPatch(`/business-events/${id}`, input),

  cancel: (id: number, reason?: string): Promise<EventItem> => httpPost(`/business-events/${id}/cancel`, { reason }),

  remove: (id: number): Promise<void> => httpDelete(`/business-events/${id}`),

  listTickets: (eventId: number): Promise<TicketItem[]> => httpGet(`/business-events/${eventId}/tickets`),
  createTicket: (eventId: number, input: TicketInput): Promise<TicketItem> =>
    httpPost(`/business-events/${eventId}/tickets`, input),
  updateTicket: (eventId: number, ticketId: number, input: Partial<TicketInput>): Promise<TicketItem> =>
    httpPatch(`/business-events/${eventId}/tickets/${ticketId}`, input),
  deleteTicket: (eventId: number, ticketId: number): Promise<void> =>
    httpDelete(`/business-events/${eventId}/tickets/${ticketId}`),

  listRegistrations: (eventId: number): Promise<RegistrationItem[]> => httpGet(`/business-events/${eventId}/registrations`),
  register: (eventId: number, input: RegistrationInput): Promise<RegistrationItem> =>
    httpPost(`/business-events/${eventId}/registrations`, input),
  cancelRegistration: (eventId: number, registrationId: number): Promise<RegistrationItem> =>
    httpPost(`/business-events/${eventId}/registrations/${registrationId}/cancel`, {}),
  checkIn: (eventId: number, registrationId: number, checkIn: boolean): Promise<RegistrationItem> =>
    httpPost(`/business-events/${eventId}/registrations/${registrationId}/check-in`, { checkIn }),

  listCoHosts: (eventId: number): Promise<CoHostItem[]> => httpGet(`/business-events/${eventId}/co-hosts`),
  inviteCoHost: (eventId: number, hostBusinessId: number, role?: string): Promise<CoHostItem> =>
    httpPost(`/business-events/${eventId}/co-hosts`, { host_business_id: hostBusinessId, role }),
  respondCoHost: (eventId: number, coHostId: number, accept: boolean): Promise<CoHostItem> =>
    httpPost(`/business-events/${eventId}/co-hosts/${coHostId}/respond`, { accept }),

  listUpdates: (eventId: number): Promise<UpdateItem[]> => httpGet(`/business-events/${eventId}/updates`),
  createUpdate: (eventId: number, title: string | null, content: string): Promise<UpdateItem> =>
    httpPost(`/business-events/${eventId}/updates`, { title, content }),
};
