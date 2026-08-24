import { httpDelete, httpGet, httpPatch, httpPost } from "@/lib/api/http";
import type { CreateEventInput, Event, Registrant, UpdateEventInput } from "./types";

export const businessEventsRealApi = {
  listEvents: (): Promise<Event[]> => httpGet("/events/events"),

  createEvent: (input: CreateEventInput): Promise<Event> => httpPost("/events/events", input),

  updateEvent: (eventId: number, input: UpdateEventInput): Promise<Event> =>
    httpPatch(`/events/events/${eventId}`, input),

  deleteEvent: (eventId: number): Promise<void> => httpDelete(`/events/events/${eventId}`),

  listRegistrants: (eventId: number): Promise<Registrant[]> => httpGet(`/events/events/${eventId}/registrants`),
};
