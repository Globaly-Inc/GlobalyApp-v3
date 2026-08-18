import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { applicationChargesApi } from "../apis";
import type { ApplicationCharge, ChargeStats, ListChargesParams } from "../apis/types";

export const fetchApplicationCharges = createAsyncThunk(
  "revenueApplicationCharges/fetch",
  (params: ListChargesParams = { limit: 100 }) => applicationChargesApi.getCharges(params),
);

export const fetchApplicationChargeStats = createAsyncThunk(
  "revenueApplicationCharges/fetchStats",
  () => applicationChargesApi.getStats(),
);

export const waiveApplicationCharge = createAsyncThunk(
  "revenueApplicationCharges/waive",
  (id: number) => applicationChargesApi.waive(id),
);

export const refundApplicationCharge = createAsyncThunk(
  "revenueApplicationCharges/refund",
  (id: number) => applicationChargesApi.refund(id),
);

type Status = "idle" | "loading" | "failed";

type ApplicationChargesState = {
  charges: ApplicationCharge[];
  stats: ChargeStats | null;
  status: Status;
  // Per-region, so a failing stats call still leaves the table rendered.
  statsStatus: Status;
  error: string | null;
};

const initialState: ApplicationChargesState = {
  charges: [],
  stats: null,
  status: "idle",
  statsStatus: "idle",
  error: null,
};

const applicationChargesSlice = createSlice({
  name: "revenueApplicationCharges",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchApplicationCharges.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchApplicationCharges.fulfilled, (state, action) => {
        state.status = "idle";
        state.charges = action.payload;
      })
      .addCase(fetchApplicationCharges.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load application charges.";
      })
      .addCase(fetchApplicationChargeStats.pending, (state) => {
        state.statsStatus = "loading";
      })
      .addCase(fetchApplicationChargeStats.fulfilled, (state, action) => {
        state.statsStatus = "idle";
        state.stats = action.payload;
      })
      .addCase(fetchApplicationChargeStats.rejected, (state) => {
        state.statsStatus = "failed";
      });

    // Waive/refund answer with the new status only (not the whole row), so the
    // status is patched in place rather than replacing the row and losing the
    // joined business/student names.
    for (const thunk of [waiveApplicationCharge, refundApplicationCharge]) {
      builder.addCase(thunk.fulfilled, (state, action) => {
        const { charge_id, status } = action.payload;
        state.charges = state.charges.map((c) => (c.id === charge_id ? { ...c, status } : c));
      });
      builder.addCase(thunk.rejected, (state, action) => {
        state.error = action.error.message ?? "Could not void this charge.";
      });
    }
  },
});

export const applicationChargesReducer = applicationChargesSlice.reducer;
