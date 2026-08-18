import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";

import { businessEventsApi } from "../apis";
import type {
  BusinessEvent,
  EventInput,
  EventListParams,
  EventPatch,
  EventRegistration,
  EventTicket,
  RegistrationListParams,
  RegistrationStatus,
  TicketInput,
  TicketPatch,
} from "../apis";

export const fetchBusinessEvents = createAsyncThunk(
  "businessEvents/list",
  (params: EventListParams = {}) => businessEventsApi.getEvents(params),
);

export const createBusinessEvent = createAsyncThunk("businessEvents/create", (input: EventInput) =>
  businessEventsApi.createEvent(input),
);

export const updateBusinessEvent = createAsyncThunk(
  "businessEvents/update",
  ({ eventId, patch }: { eventId: number; patch: EventPatch }) =>
    businessEventsApi.updateEvent(eventId, patch),
);

export const deleteBusinessEvent = createAsyncThunk("businessEvents/delete", async (eventId: number) => {
  await businessEventsApi.deleteEvent(eventId);
  return eventId;
});

export const fetchEventTickets = createAsyncThunk("businessEvents/tickets", (eventId: number) =>
  businessEventsApi.getTickets(eventId),
);

export const createEventTicket = createAsyncThunk(
  "businessEvents/createTicket",
  ({ eventId, input }: { eventId: number; input: TicketInput }) =>
    businessEventsApi.createTicket(eventId, input),
);

export const updateEventTicket = createAsyncThunk(
  "businessEvents/updateTicket",
  ({ eventId, ticketId, patch }: { eventId: number; ticketId: number; patch: TicketPatch }) =>
    businessEventsApi.updateTicket(eventId, ticketId, patch),
);

export const deleteEventTicket = createAsyncThunk(
  "businessEvents/deleteTicket",
  async ({ eventId, ticketId }: { eventId: number; ticketId: number }) => {
    await businessEventsApi.deleteTicket(eventId, ticketId);
    return ticketId;
  },
);

export const fetchEventRegistrations = createAsyncThunk(
  "businessEvents/registrations",
  ({ eventId, ...params }: RegistrationListParams & { eventId: number }) =>
    businessEventsApi.getRegistrations(eventId, params),
);

export const setRegistrationStatus = createAsyncThunk(
  "businessEvents/setRegistrationStatus",
  ({ registrationId, status }: { registrationId: number; status: RegistrationStatus }) =>
    businessEventsApi.setRegistrationStatus(registrationId, status),
);

type Status = "idle" | "loading" | "failed";

interface State {
  events: BusinessEvent[];
  eventsTotal: number;
  /** The event whose detail panel is open, or null for the list. */
  selectedEvent: BusinessEvent | null;
  tickets: EventTicket[];
  registrations: EventRegistration[];
  registrationsTotal: number;
  // Per region, so a failure in one table leaves the others rendered.
  eventsStatus: Status;
  ticketsStatus: Status;
  registrationsStatus: Status;
  error: string | null;
}

const initialState: State = {
  events: [],
  eventsTotal: 0,
  selectedEvent: null,
  tickets: [],
  registrations: [],
  registrationsTotal: 0,
  eventsStatus: "idle",
  ticketsStatus: "idle",
  registrationsStatus: "idle",
  error: null,
};

const slice = createSlice({
  name: "businessEvents",
  initialState,
  reducers: {
    selectEvent(state, action: PayloadAction<BusinessEvent>) {
      state.selectedEvent = action.payload;
      state.tickets = [];
      state.registrations = [];
      state.registrationsTotal = 0;
    },
    clearSelectedEvent(state) {
      state.selectedEvent = null;
      state.tickets = [];
      state.registrations = [];
      state.registrationsTotal = 0;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchBusinessEvents.pending, (state) => {
        state.eventsStatus = "loading";
      })
      .addCase(fetchBusinessEvents.fulfilled, (state, action) => {
        state.eventsStatus = "idle";
        state.events = action.payload.data;
        state.eventsTotal = action.payload.meta.total;
      })
      .addCase(fetchBusinessEvents.rejected, (state, action) => {
        state.eventsStatus = "failed";
        state.error = action.error.message ?? "Could not load your events.";
      })

      .addCase(createBusinessEvent.fulfilled, (state, action) => {
        state.events = [action.payload, ...state.events];
        state.eventsTotal += 1;
      })

      .addCase(updateBusinessEvent.fulfilled, (state, action) => {
        state.events = state.events.map((e) => (e.id === action.payload.id ? action.payload : e));
        if (state.selectedEvent?.id === action.payload.id) state.selectedEvent = action.payload;
      })

      .addCase(deleteBusinessEvent.fulfilled, (state, action) => {
        state.events = state.events.filter((e) => e.id !== action.payload);
        state.eventsTotal = Math.max(state.eventsTotal - 1, 0);
        if (state.selectedEvent?.id === action.payload) state.selectedEvent = null;
      })

      .addCase(fetchEventTickets.pending, (state) => {
        state.ticketsStatus = "loading";
      })
      .addCase(fetchEventTickets.fulfilled, (state, action) => {
        state.ticketsStatus = "idle";
        state.tickets = action.payload;
      })
      .addCase(fetchEventTickets.rejected, (state, action) => {
        state.ticketsStatus = "failed";
        state.error = action.error.message ?? "Could not load ticket types.";
      })

      .addCase(createEventTicket.fulfilled, (state, action) => {
        state.tickets = [...state.tickets, action.payload];
      })
      .addCase(updateEventTicket.fulfilled, (state, action) => {
        state.tickets = state.tickets.map((t) => (t.id === action.payload.id ? action.payload : t));
      })
      .addCase(deleteEventTicket.fulfilled, (state, action) => {
        state.tickets = state.tickets.filter((t) => t.id !== action.payload);
      })

      .addCase(fetchEventRegistrations.pending, (state) => {
        state.registrationsStatus = "loading";
      })
      .addCase(fetchEventRegistrations.fulfilled, (state, action) => {
        state.registrationsStatus = "idle";
        state.registrations = action.payload.data;
        state.registrationsTotal = action.payload.meta.total;
      })
      .addCase(fetchEventRegistrations.rejected, (state, action) => {
        state.registrationsStatus = "failed";
        state.error = action.error.message ?? "Could not load registrations.";
      })

      // The host PATCH returns the raw registration row, not the joined list shape — and
      // nothing at all when the row was already cancelled. Merge over the existing row so
      // the attendee columns survive, and ignore an empty response.
      .addCase(setRegistrationStatus.fulfilled, (state, action) => {
        const updated = action.payload as EventRegistration | undefined;
        if (!updated?.id) return;
        state.registrations = state.registrations.map((r) =>
          r.id === updated.id ? { ...r, ...updated } : r,
        );
      });
  },
});

export const { selectEvent, clearSelectedEvent } = slice.actions;
export const businessEventsReducer = slice.reducer;
