import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { enquiriesApi } from "../apis";
import type { Enquiry } from "../apis/types";

export const fetchEnquiries = createAsyncThunk("monitoringEnquiries/fetch", () => enquiriesApi.getEnquiries());

type EnquiriesState = {
  enquiries: Enquiry[];
  status: "idle" | "loading" | "failed";
  error: string | null;
};

const initialState: EnquiriesState = { enquiries: [], status: "idle", error: null };

const enquiriesSlice = createSlice({
  name: "monitoringEnquiries",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchEnquiries.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchEnquiries.fulfilled, (state, action) => {
        state.status = "idle";
        state.enquiries = action.payload;
      })
      .addCase(fetchEnquiries.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load enquiries.";
      });
  },
});

export const enquiriesReducer = enquiriesSlice.reducer;
