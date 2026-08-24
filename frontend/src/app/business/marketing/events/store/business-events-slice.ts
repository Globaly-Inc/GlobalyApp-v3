import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { businessEventsApi } from "../apis";
import type { EventItem } from "../apis/types";

export const fetchEvents = createAsyncThunk(
  "businessEvents/fetchAll",
  async (params: { status?: string; search?: string } = {}) => {
    const result = await businessEventsApi.list(params);
    return result.data;
  },
);

export const cancelEvent = createAsyncThunk(
  "businessEvents/cancel",
  async ({ id, reason }: { id: number; reason?: string }, { rejectWithValue }) => {
    try {
      return await businessEventsApi.cancel(id, reason);
    } catch (err) {
      return rejectWithValue(err instanceof Error ? err.message : "Failed to cancel event");
    }
  },
);

export const deleteEvent = createAsyncThunk(
  "businessEvents/delete",
  async (id: number, { rejectWithValue }) => {
    try {
      await businessEventsApi.remove(id);
      return id;
    } catch (err) {
      return rejectWithValue(err instanceof Error ? err.message : "Failed to delete event");
    }
  },
);

type BusinessEventsState = {
  items: EventItem[];
  status: "idle" | "loading" | "failed";
  error: string | null;
  actingId: number | null;
  actionError: string | null;
};

const initialState: BusinessEventsState = {
  items: [],
  status: "idle",
  error: null,
  actingId: null,
  actionError: null,
};

const businessEventsSlice = createSlice({
  name: "businessEvents",
  initialState,
  reducers: {
    clearActionError: (state) => {
      state.actionError = null;
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

      .addCase(cancelEvent.pending, (state, action) => {
        state.actingId = action.meta.arg.id;
        state.actionError = null;
      })
      .addCase(cancelEvent.fulfilled, (state, action) => {
        state.actingId = null;
        state.items = state.items.map((e) => (e.id === action.payload.id ? action.payload : e));
      })
      .addCase(cancelEvent.rejected, (state, action) => {
        state.actingId = null;
        state.actionError = (action.payload as string) ?? "Failed to cancel event";
      })

      .addCase(deleteEvent.pending, (state, action) => {
        state.actingId = action.meta.arg;
        state.actionError = null;
      })
      .addCase(deleteEvent.fulfilled, (state, action) => {
        state.actingId = null;
        state.items = state.items.filter((e) => e.id !== action.payload);
      })
      .addCase(deleteEvent.rejected, (state, action) => {
        state.actingId = null;
        state.actionError = (action.payload as string) ?? "Failed to delete event";
      });
  },
});

export const { clearActionError } = businessEventsSlice.actions;
export const businessEventsReducer = businessEventsSlice.reducer;
