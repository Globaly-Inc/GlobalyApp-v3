import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { enquiriesApi } from "../apis";
import type { AdminEnquiry, AdminEnquiryStats, ListEnquiriesParams } from "../apis/types";

export const fetchEnquiries = createAsyncThunk(
  "monitoringEnquiries/fetchList",
  (params: ListEnquiriesParams = {}) => enquiriesApi.getEnquiries(params),
);

export const fetchEnquiryStats = createAsyncThunk("monitoringEnquiries/fetchStats", () =>
  enquiriesApi.getStats(),
);

type Status = "idle" | "loading" | "failed";

type EnquiriesState = {
  enquiries: AdminEnquiry[];
  stats: AdminEnquiryStats | null;
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  // Per-region status, so a failing stats call still leaves the table rendered.
  listStatus: Status;
  statsStatus: Status;
  error: string | null;
};

const initialState: EnquiriesState = {
  enquiries: [],
  stats: null,
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 0,
  listStatus: "idle",
  statsStatus: "idle",
  error: null,
};

const enquiriesSlice = createSlice({
  name: "monitoringEnquiries",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchEnquiries.pending, (state) => {
        state.listStatus = "loading";
        state.error = null;
      })
      .addCase(fetchEnquiries.fulfilled, (state, action) => {
        state.listStatus = "idle";
        state.enquiries = action.payload.data;
        state.page = action.payload.meta.page;
        state.limit = action.payload.meta.limit;
        state.total = action.payload.meta.total;
        state.totalPages = action.payload.meta.totalPages;
      })
      .addCase(fetchEnquiries.rejected, (state, action) => {
        state.listStatus = "failed";
        state.error = action.error.message ?? "Failed to load enquiries.";
      })
      .addCase(fetchEnquiryStats.pending, (state) => {
        state.statsStatus = "loading";
      })
      .addCase(fetchEnquiryStats.fulfilled, (state, action) => {
        state.statsStatus = "idle";
        state.stats = action.payload;
      })
      .addCase(fetchEnquiryStats.rejected, (state) => {
        state.statsStatus = "failed";
      });
  },
});

export const enquiriesReducer = enquiriesSlice.reducer;
