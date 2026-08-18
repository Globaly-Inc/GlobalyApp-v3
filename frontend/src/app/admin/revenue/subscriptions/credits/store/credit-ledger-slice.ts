import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { creditLedgerApi } from "../apis";
import type { CreditLedgerRow, ListCreditsParams } from "../apis/types";

export const fetchCredits = createAsyncThunk(
  "adminCreditLedger/fetchCredits",
  (params: ListCreditsParams = {}) => creditLedgerApi.listCredits(params),
);

type CreditLedgerState = {
  rows: CreditLedgerRow[];
  meta: { page: number; limit: number; total: number; totalPages: number };
  status: "idle" | "loading" | "failed";
  error: string | null;
};

const initialState: CreditLedgerState = {
  rows: [],
  meta: { page: 1, limit: 20, total: 0, totalPages: 1 },
  status: "idle",
  error: null,
};

const creditLedgerSlice = createSlice({
  name: "adminCreditLedger",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchCredits.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchCredits.fulfilled, (state, action) => {
        state.status = "idle";
        state.rows = action.payload.data;
        state.meta = action.payload.meta;
      })
      .addCase(fetchCredits.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load the credit ledger.";
      });
  },
});

export const creditLedgerReducer = creditLedgerSlice.reducer;
