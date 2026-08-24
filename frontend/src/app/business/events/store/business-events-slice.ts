import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { businessEventsApi } from "../apis";
import type { CreateEventInput, Event, Registrant } from "../apis/types";

export const fetchEvents = createAsyncThunk("businessEvents/fetchAll", () => businessEventsApi.listEvents());

export const createEvent = createAsyncThunk(
  "businessEvents/create",
  async (input: CreateEventInput, { rejectWithValue }) => {
    try {
      return await businessEventsApi.createEvent(input);
    } catch (err) {
      return rejectWithValue(err instanceof Error ? err.message : "Failed to create event");
    }
  },
);

export const setEventStatus = createAsyncThunk(
  "businessEvents/setStatus",
  ({ eventId, status }: { eventId: number; status: Event["status"] }) =>
    businessEventsApi.updateEvent(eventId, { status }),
);

export const deleteEvent = createAsyncThunk("businessEvents/delete", async (eventId: number) => {
  await businessEventsApi.deleteEvent(eventId);
  return eventId;
});

export const fetchRegistrants = createAsyncThunk("businessEvents/fetchRegistrants", (eventId: number) =>
  businessEventsApi.listRegistrants(eventId).then((registrants) => ({ eventId, registrants })),
);

type BusinessEventsState = {
  items: Event[];
  status: "idle" | "loading" | "failed";
  error: string | null;
  creating: boolean;
  createError: string | null;
  registrantsByEvent: Record<number, Registrant[]>;
  registrantsLoading: number | null;
};

const initialState: BusinessEventsState = {
  items: [],
  status: "idle",
  error: null,
  creating: false,
  createError: null,
  registrantsByEvent: {},
  registrantsLoading: null,
};

const businessEventsSlice = createSlice({
  name: "businessEvents",
  initialState,
  reducers: {
    clearCreateError: (state) => {
      state.createError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchEvents.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchEvents.fulfilled, (state, action) => {
        state.status = "idle";
        state.items = action.payload;
      })
      .addCase(fetchEvents.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load events";
      })

      .addCase(createEvent.pending, (state) => {
        state.creating = true;
        state.createError = null;
      })
      .addCase(createEvent.fulfilled, (state, action) => {
        state.creating = false;
        state.items = [action.payload, ...state.items];
      })
      .addCase(createEvent.rejected, (state, action) => {
        state.creating = false;
        state.createError = (action.payload as string) ?? "Failed to create event";
      })

      .addCase(setEventStatus.fulfilled, (state, action) => {
        state.items = state.items.map((e) => (e.id === action.payload.id ? action.payload : e));
      })

      .addCase(deleteEvent.fulfilled, (state, action) => {
        state.items = state.items.filter((e) => e.id !== action.payload);
      })

      .addCase(fetchRegistrants.pending, (state, action) => {
        state.registrantsLoading = action.meta.arg;
      })
      .addCase(fetchRegistrants.fulfilled, (state, action) => {
        state.registrantsLoading = null;
        state.registrantsByEvent[action.payload.eventId] = action.payload.registrants;
      })
      .addCase(fetchRegistrants.rejected, (state) => {
        state.registrantsLoading = null;
      });
  },
});

export const { clearCreateError } = businessEventsSlice.actions;
export const businessEventsReducer = businessEventsSlice.reducer;
