import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { creditsLedgerApi } from "../apis";
import type { LedgerEntry, AdjustInput } from "../apis/types";

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

type CreditsLedgerState = {
  entries: LedgerEntry[];
  total: number;
  page: number;
  status: "idle" | "loading" | "failed";
  adjustStatus: "idle" | "loading" | "failed";
  error: string | null;
};

const initialState: CreditsLedgerState = {
  entries: [],
  total: 0,
  page: 1,
  status: "idle",
  adjustStatus: "idle",
  error: null,
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
      });
  },
});

export const { resetAdjustStatus } = creditsLedgerSlice.actions;
export const creditsLedgerReducer = creditsLedgerSlice.reducer;
