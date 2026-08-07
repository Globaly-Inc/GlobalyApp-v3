import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { overviewApi } from "../apis";
import type { OverviewStats } from "../apis/types";

export const fetchOverviewStats = createAsyncThunk("overview/fetchStats", () => overviewApi.getStats());

type OverviewState = {
  stats: OverviewStats | null;
  status: "idle" | "loading" | "failed";
  error: string | null;
};

const initialState: OverviewState = { stats: null, status: "idle", error: null };

const overviewSlice = createSlice({
  name: "overview",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchOverviewStats.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchOverviewStats.fulfilled, (state, action) => {
        state.status = "idle";
        state.stats = action.payload;
      })
      .addCase(fetchOverviewStats.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load dashboard stats.";
      });
  },
});

export const overviewReducer = overviewSlice.reducer;
