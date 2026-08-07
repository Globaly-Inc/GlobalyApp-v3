import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { visasApi } from "../apis";
import type { VisaSummary } from "../apis/types";

export const fetchVisas = createAsyncThunk("dataVisas/fetch", () => visasApi.getVisas());

type VisasState = {
  visas: VisaSummary[];
  status: "idle" | "loading" | "failed";
  error: string | null;
};

const initialState: VisasState = { visas: [], status: "idle", error: null };

const visasSlice = createSlice({
  name: "dataVisas",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchVisas.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchVisas.fulfilled, (state, action) => {
        state.status = "idle";
        state.visas = action.payload;
      })
      .addCase(fetchVisas.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load visas.";
      });
  },
});

export const visasReducer = visasSlice.reducer;
