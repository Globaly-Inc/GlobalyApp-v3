import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { businessEnquiriesApi } from "../apis";
import type { InboxItem } from "../apis/types";

export const fetchDistributions = createAsyncThunk("businessEnquiries/fetchAll", async () => {
  const result = await businessEnquiriesApi.listDistributions();
  return result.data;
});

export const fetchCredits = createAsyncThunk("businessEnquiries/fetchCredits", () =>
  businessEnquiriesApi.getCredits(),
);

export const unlockDistribution = createAsyncThunk(
  "businessEnquiries/unlock",
  // rejectWithValue so the server's own message (402 "Insufficient credits…")
  // reaches the UI verbatim.
  async (id: number, { rejectWithValue }) => {
    try {
      return await businessEnquiriesApi.unlock(id);
    } catch (err) {
      return rejectWithValue(err instanceof Error ? err.message : "Failed to unlock enquiry");
    }
  },
);

export const closeDistribution = createAsyncThunk(
  "businessEnquiries/close",
  async ({ id, closeReason }: { id: number; closeReason: string }, { rejectWithValue }) => {
    try {
      return await businessEnquiriesApi.close(id, closeReason);
    } catch (err) {
      return rejectWithValue(err instanceof Error ? err.message : "Failed to close enquiry");
    }
  },
);

type BusinessEnquiriesState = {
  items: InboxItem[];
  status: "idle" | "loading" | "failed";
  error: string | null;
  credits: number | null;
  unlockCost: number;
  /** distribution id currently being unlocked or closed — drives per-row spinners
   * so one pending action doesn't disable every button in the list. */
  actingId: number | null;
  actionError: string | null;
};

const initialState: BusinessEnquiriesState = {
  items: [],
  status: "idle",
  error: null,
  credits: null,
  unlockCost: 0,
  actingId: null,
  actionError: null,
};

const businessEnquiriesSlice = createSlice({
  name: "businessEnquiries",
  initialState,
  reducers: {
    clearActionError: (state) => {
      state.actionError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchDistributions.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchDistributions.fulfilled, (state, action) => {
        state.status = "idle";
        state.items = action.payload;
      })
      .addCase(fetchDistributions.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load enquiries";
      })

      .addCase(fetchCredits.fulfilled, (state, action) => {
        state.credits = action.payload.balance;
        state.unlockCost = action.payload.unlock_cost;
      })

      .addCase(unlockDistribution.pending, (state, action) => {
        state.actingId = action.meta.arg;
        state.actionError = null;
      })
      .addCase(unlockDistribution.fulfilled, (state, action) => {
        state.actingId = null;
        state.credits = action.payload.balance;
        // Replace the row outright rather than patching fields onto it: unlock
        // returns the whole re-masked item, so the server's own shape is the one
        // that lands in the store and locked/unlocked stays a clean discriminated
        // union instead of a half-unlocked hybrid. A refetch would work too, but
        // it would reset scroll position to move one row.
        state.items = state.items.map((item) =>
          item.id === action.payload.enquiry.id ? action.payload.enquiry : item,
        );
      })
      .addCase(unlockDistribution.rejected, (state, action) => {
        state.actingId = null;
        state.actionError = (action.payload as string) ?? "Failed to unlock enquiry";
      })

      .addCase(closeDistribution.pending, (state, action) => {
        state.actingId = action.meta.arg.id;
        state.actionError = null;
      })
      .addCase(closeDistribution.fulfilled, (state, action) => {
        state.actingId = null;
        // Close only ever touches these three columns, and the response carries
        // nothing else — so this is a patch, not a replacement. The paywall state
        // is untouched: closing a lead you paid for does not re-lock it.
        state.items = state.items.map((item) =>
          item.id === action.payload.id
            ? {
                ...item,
                status: action.payload.status,
                closed_at: action.payload.closed_at,
                close_reason: action.payload.close_reason,
              }
            : item,
        );
      })
      .addCase(closeDistribution.rejected, (state, action) => {
        state.actingId = null;
        state.actionError = (action.payload as string) ?? "Failed to close enquiry";
      });
  },
});

export const { clearActionError } = businessEnquiriesSlice.actions;
export const businessEnquiriesReducer = businessEnquiriesSlice.reducer;
