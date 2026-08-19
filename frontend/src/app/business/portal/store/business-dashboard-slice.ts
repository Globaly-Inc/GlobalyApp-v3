import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { businessDashboardApi } from "../apis";
import type { BusinessDashboard } from "../apis/types";

export const fetchBusinessDashboard = createAsyncThunk(
  "businessDashboard/fetch",
  // rejectWithValue so a 403 "Not a member of this business" reaches the screen
  // verbatim instead of becoming a generic failure — it is the one error a user
  // can act on (switch business, or ask to be re-added to the team).
  async (_: void, { rejectWithValue }) => {
    try {
      return await businessDashboardApi.getDashboard();
    } catch (err) {
      return rejectWithValue(err instanceof Error ? err.message : "Failed to load your dashboard");
    }
  },
);

type BusinessDashboardState = {
  data: BusinessDashboard | null;
  status: "idle" | "loading" | "failed";
  error: string | null;
};

const initialState: BusinessDashboardState = {
  data: null,
  status: "idle",
  error: null,
};

const businessDashboardSlice = createSlice({
  name: "businessDashboard",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchBusinessDashboard.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchBusinessDashboard.fulfilled, (state, action) => {
        state.status = "idle";
        state.data = action.payload;
      })
      .addCase(fetchBusinessDashboard.rejected, (state, action) => {
        state.status = "failed";
        // The previous payload is dropped on purpose: a stale dashboard rendered
        // next to an error banner is worse than an honest empty screen, because
        // every number on it is a number the server just declined to confirm.
        state.data = null;
        state.error = (action.payload as string) ?? "Failed to load your dashboard";
      });
  },
});

export const businessDashboardReducer = businessDashboardSlice.reducer;
