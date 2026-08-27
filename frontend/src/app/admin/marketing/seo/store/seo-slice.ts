import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { seoApi } from "../apis";
import type { ActionPlanItem, ReadinessRow, RankingRow, Suggestion } from "../apis/types";

export const fetchSeoStatus = createAsyncThunk("marketingSeo/fetchStatus", () => seoApi.getStatus());

export const fetchDashboard = createAsyncThunk("marketingSeo/fetchDashboard", async () => {
  const [rankings, suggestions, readiness] = await Promise.all([
    seoApi.getRankings(),
    seoApi.getSuggestions(),
    seoApi.getReadiness(),
  ]);
  return { rankings, suggestions: suggestions.suggestions, readiness: readiness.readiness };
});

export const regenerateActionPlan = createAsyncThunk("marketingSeo/regenerateActionPlan", () => seoApi.generateActionPlan());

type AsyncStatus = "idle" | "loading" | "failed";

type SeoState = {
  connected: boolean | null;
  statusStatus: AsyncStatus;
  rankings: RankingRow[];
  stale: boolean;
  suggestions: Suggestion[];
  readiness: ReadinessRow[];
  actionPlan: ActionPlanItem[];
  dashboardStatus: AsyncStatus;
  actionPlanStatus: AsyncStatus;
  error: string | null;
};

const initialState: SeoState = {
  connected: null,
  statusStatus: "idle",
  rankings: [],
  stale: false,
  suggestions: [],
  readiness: [],
  actionPlan: [],
  dashboardStatus: "idle",
  actionPlanStatus: "idle",
  error: null,
};

const seoSlice = createSlice({
  name: "marketingSeo",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchSeoStatus.pending, (state) => {
        state.statusStatus = "loading";
      })
      .addCase(fetchSeoStatus.fulfilled, (state, action) => {
        state.statusStatus = "idle";
        state.connected = action.payload.connected;
      })
      .addCase(fetchSeoStatus.rejected, (state, action) => {
        state.statusStatus = "failed";
        state.error = action.error.message ?? "Failed to check the Search Console connection.";
      })
      .addCase(fetchDashboard.pending, (state) => {
        state.dashboardStatus = "loading";
        state.error = null;
      })
      .addCase(fetchDashboard.fulfilled, (state, action) => {
        state.dashboardStatus = "idle";
        state.rankings = action.payload.rankings.rows;
        state.stale = action.payload.rankings.stale;
        state.suggestions = action.payload.suggestions;
        state.readiness = action.payload.readiness;
      })
      .addCase(fetchDashboard.rejected, (state, action) => {
        state.dashboardStatus = "failed";
        state.error = action.error.message ?? "Failed to load the SEO/AEO dashboard.";
      })
      .addCase(regenerateActionPlan.pending, (state) => {
        state.actionPlanStatus = "loading";
      })
      .addCase(regenerateActionPlan.fulfilled, (state, action) => {
        state.actionPlanStatus = "idle";
        state.actionPlan = action.payload.plan;
      })
      .addCase(regenerateActionPlan.rejected, (state, action) => {
        state.actionPlanStatus = "failed";
        state.error = action.error.message ?? "Failed to generate the action plan.";
      });
  },
});

export const seoReducer = seoSlice.reducer;
