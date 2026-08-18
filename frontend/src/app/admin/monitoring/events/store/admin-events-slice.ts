import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";

import { adminEventsApi } from "../apis";
import type { AdminEvent, AdminEventRegistration, AdminEventStats } from "../apis";

export const fetchEventStats = createAsyncThunk("adminEvents/stats", () => adminEventsApi.getStats());

export const fetchAdminEvents = createAsyncThunk(
  "adminEvents/list",
  (params: { q?: string; status?: string; event_type?: string; page?: number } = {}) =>
    adminEventsApi.getEvents(params),
);

export const fetchEventRegistrations = createAsyncThunk(
  "adminEvents/registrations",
  ({ eventId, page }: { eventId: number; page?: number }) =>
    adminEventsApi.getRegistrations(eventId, { page }),
);

type Status = "idle" | "loading" | "failed";

interface State {
  stats: AdminEventStats | null;
  events: AdminEvent[];
  eventsTotal: number;
  /** The event whose attendee list is open, or null for the events table. */
  openEvent: AdminEvent | null;
  registrations: AdminEventRegistration[];
  registrationsTotal: number;
  // Per region, so a failure in one table leaves the other rendered.
  statsStatus: Status;
  eventsStatus: Status;
  registrationsStatus: Status;
  error: string | null;
}

const initialState: State = {
  stats: null,
  events: [],
  eventsTotal: 0,
  openEvent: null,
  registrations: [],
  registrationsTotal: 0,
  statsStatus: "idle",
  eventsStatus: "idle",
  registrationsStatus: "idle",
  error: null,
};

const slice = createSlice({
  name: "adminEvents",
  initialState,
  reducers: {
    openEvent(state, action: { payload: AdminEvent }) {
      state.openEvent = action.payload;
      state.registrations = [];
      state.registrationsTotal = 0;
    },
    closeEvent(state) {
      state.openEvent = null;
      state.registrations = [];
      state.registrationsTotal = 0;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchEventStats.pending, (state) => {
        state.statsStatus = "loading";
      })
      .addCase(fetchEventStats.fulfilled, (state, action) => {
        state.statsStatus = "idle";
        state.stats = action.payload;
      })
      .addCase(fetchEventStats.rejected, (state, action) => {
        state.statsStatus = "failed";
        state.error = action.error.message ?? "Could not load event stats.";
      })

      .addCase(fetchAdminEvents.pending, (state) => {
        state.eventsStatus = "loading";
      })
      .addCase(fetchAdminEvents.fulfilled, (state, action) => {
        state.eventsStatus = "idle";
        state.events = action.payload.data;
        state.eventsTotal = action.payload.meta.total;
      })
      .addCase(fetchAdminEvents.rejected, (state, action) => {
        state.eventsStatus = "failed";
        state.error = action.error.message ?? "Could not load events.";
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
      });
  },
});

export const { openEvent, closeEvent } = slice.actions;
export const adminEventsReducer = slice.reducer;
