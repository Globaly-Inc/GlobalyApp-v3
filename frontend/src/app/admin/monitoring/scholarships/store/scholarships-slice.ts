import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { scholarshipsApi } from "../apis";
import type { Scholarship } from "../apis/types";

export const fetchScholarships = createAsyncThunk("monitoringScholarships/fetch", () => scholarshipsApi.getScholarships());

type ScholarshipsState = {
  scholarships: Scholarship[];
  status: "idle" | "loading" | "failed";
  error: string | null;
};

const initialState: ScholarshipsState = { scholarships: [], status: "idle", error: null };

const scholarshipsSlice = createSlice({
  name: "monitoringScholarships",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchScholarships.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchScholarships.fulfilled, (state, action) => {
        state.status = "idle";
        state.scholarships = action.payload;
      })
      .addCase(fetchScholarships.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load scholarships.";
      });
  },
});

export const scholarshipsReducer = scholarshipsSlice.reducer;
