import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { eventsApi } from "../apis";
import type { AdminEvent } from "../apis/types";

export const fetchEvents = createAsyncThunk("monitoringEvents/fetch", () => eventsApi.getEvents());

type EventsState = {
  events: AdminEvent[];
  status: "idle" | "loading" | "failed";
  error: string | null;
};

const initialState: EventsState = { events: [], status: "idle", error: null };

const eventsSlice = createSlice({
  name: "monitoringEvents",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchEvents.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchEvents.fulfilled, (state, action) => {
        state.status = "idle";
        state.events = action.payload;
      })
      .addCase(fetchEvents.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load events.";
      });
  },
});

export const eventsReducer = eventsSlice.reducer;
