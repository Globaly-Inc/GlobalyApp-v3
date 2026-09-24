import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { creditsLedgerApi } from "../apis";
import type { LedgerEntry, AdjustInput, DailyLogEntry, ChartSeries, ChartMetric } from "../apis/types";

export const fetchLedger = createAsyncThunk(
  "creditsLedger/fetchLedger",
  (params: { page?: number; limit?: number; reason?: string; search?: string }) =>
    creditsLedgerApi.getLedger(params),
);

export const searchUsers = createAsyncThunk("creditsLedger/searchUsers", async (q: string) =>
  creditsLedgerApi.searchUsers(q, "platform"),
);

export const applyAdjustment = createAsyncThunk("creditsLedger/applyAdjustment", (input: AdjustInput) =>
  creditsLedgerApi.adjust(input),
);

export const fetchDailyLog = createAsyncThunk(
  "creditsLedger/fetchDailyLog",
  (params: { date?: string; page?: number; limit?: number; search?: string }) =>
    creditsLedgerApi.getDailyLog(params),
);

export const fetchChart = createAsyncThunk(
  "creditsLedger/fetchChart",
  (params: { metric?: ChartMetric; days?: number }) =>
    creditsLedgerApi.getChart(params),
);

type CreditsLedgerState = {
  entries: LedgerEntry[];
  total: number;
  page: number;
  status: "idle" | "loading" | "failed";
  adjustStatus: "idle" | "loading" | "failed";
  error: string | null;
  dailyEntries: DailyLogEntry[];
  dailyTotal: number;
  dailyStatus: "idle" | "loading" | "failed";
  chartSeries: ChartSeries[];
  chartStatus: "idle" | "loading" | "failed";
};

const initialState: CreditsLedgerState = {
  entries: [],
  total: 0,
  page: 1,
  status: "idle",
  adjustStatus: "idle",
  error: null,
  dailyEntries: [],
  dailyTotal: 0,
  dailyStatus: "idle",
  chartSeries: [],
  chartStatus: "idle",
};

const creditsLedgerSlice = createSlice({
  name: "creditsLedger",
  initialState,
  reducers: {
    resetAdjustStatus(state) {
      state.adjustStatus = "idle";
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchLedger.pending, (state) => { state.status = "loading"; state.error = null; })
      .addCase(fetchLedger.fulfilled, (state, action) => {
        state.status = "idle";
        state.entries = action.payload.data;
        state.total = action.payload.total;
        state.page = action.payload.page;
      })
      .addCase(fetchLedger.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load ledger";
      })
      .addCase(applyAdjustment.pending, (state) => { state.adjustStatus = "loading"; })
      .addCase(applyAdjustment.fulfilled, (state) => { state.adjustStatus = "idle"; })
      .addCase(applyAdjustment.rejected, (state, action) => {
        state.adjustStatus = "failed";
        state.error = action.error.message ?? "Adjustment failed";
      })
      .addCase(fetchDailyLog.pending, (state) => { state.dailyStatus = "loading"; })
      .addCase(fetchDailyLog.fulfilled, (state, action) => {
        state.dailyStatus = "idle";
        state.dailyEntries = action.payload.data;
        state.dailyTotal = action.payload.total;
      })
      .addCase(fetchDailyLog.rejected, (state) => { state.dailyStatus = "failed"; })
      .addCase(fetchChart.pending, (state) => { state.chartStatus = "loading"; })
      .addCase(fetchChart.fulfilled, (state, action) => {
        state.chartStatus = "idle";
        state.chartSeries = action.payload.series;
      })
      .addCase(fetchChart.rejected, (state) => { state.chartStatus = "failed"; });
  },
});

export const { resetAdjustStatus } = creditsLedgerSlice.actions;
export const creditsLedgerReducer = creditsLedgerSlice.reducer;
