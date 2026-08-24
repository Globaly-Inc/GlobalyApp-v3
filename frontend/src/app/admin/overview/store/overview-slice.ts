import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { overviewApi } from "../apis";
import type { DashboardData, DashboardPreset, SiteAccessSettings } from "../apis/types";

export const fetchDashboard = createAsyncThunk("overview/fetchDashboard", (preset: DashboardPreset) =>
  overviewApi.getDashboard(preset),
);

export const fetchSiteAccess = createAsyncThunk("overview/fetchSiteAccess", () => overviewApi.getSiteAccess());

export const toggleSiteLock = createAsyncThunk("overview/toggleSiteLock", (is_locked: boolean) =>
  overviewApi.updateSiteAccess(is_locked),
);

export const regenerateAccessCode = createAsyncThunk("overview/regenerateAccessCode", () =>
  overviewApi.regenerateAccessCode(),
);

type OverviewState = {
  data: DashboardData | null;
  preset: DashboardPreset;
  status: "idle" | "loading" | "failed";
  error: string | null;
  siteAccess: SiteAccessSettings | null;
};

const initialState: OverviewState = {
  data: null,
  preset: "last30",
  status: "idle",
  error: null,
  siteAccess: null,
};

const overviewSlice = createSlice({
  name: "overview",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchDashboard.pending, (state, action) => {
        state.status = "loading";
        state.preset = action.meta.arg;
        state.error = null;
      })
      .addCase(fetchDashboard.fulfilled, (state, action) => {
        state.status = "idle";
        state.data = action.payload;
      })
      .addCase(fetchDashboard.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load dashboard.";
      })
      .addCase(fetchSiteAccess.fulfilled, (state, action) => {
        state.siteAccess = action.payload;
      })
      .addCase(toggleSiteLock.fulfilled, (state, action) => {
        state.siteAccess = action.payload;
      })
      .addCase(regenerateAccessCode.fulfilled, (state, action) => {
        if (state.siteAccess) state.siteAccess.access_code = action.payload.access_code;
      });
  },
});

export const overviewReducer = overviewSlice.reducer;
