import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { businessesApi } from "../apis";
import type { BusinessSummary } from "../apis/types";

export const fetchBusinesses = createAsyncThunk("platformBusinesses/fetch", () => businessesApi.getBusinesses());

type BusinessesState = {
  businesses: BusinessSummary[];
  status: "idle" | "loading" | "failed";
  error: string | null;
};

const initialState: BusinessesState = { businesses: [], status: "idle", error: null };

const businessesSlice = createSlice({
  name: "platformBusinesses",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchBusinesses.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchBusinesses.fulfilled, (state, action) => {
        state.status = "idle";
        state.businesses = action.payload;
      })
      .addCase(fetchBusinesses.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load businesses.";
      });
  },
});

export const businessesReducer = businessesSlice.reducer;
