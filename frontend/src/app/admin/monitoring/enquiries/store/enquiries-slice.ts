import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { adminEnquiriesApi } from "../apis";
import type { AdminEnquiry, AdminEnquiryDetail, AdminEnquiryStats, EnquiryListParams } from "../apis";

export const fetchEnquiryStats = createAsyncThunk("monitoringEnquiries/stats", () => adminEnquiriesApi.getStats());

export const fetchEnquiries = createAsyncThunk("monitoringEnquiries/list", (params: EnquiryListParams = {}) =>
  adminEnquiriesApi.getEnquiries(params),
);

export const fetchEnquiryDetail = createAsyncThunk("monitoringEnquiries/detail", (id: string) =>
  adminEnquiriesApi.getEnquiry(id),
);

type Status = "idle" | "loading" | "failed";

interface State {
  stats: AdminEnquiryStats | null;
  enquiries: AdminEnquiry[];
  page: number;
  limit: number;
  total: number;
  detail: AdminEnquiryDetail | null;
  // Per region, so a failure in one leaves the rest rendered.
  statsStatus: Status;
  listStatus: Status;
  detailStatus: Status;
  error: string | null;
}

const initialState: State = {
  stats: null,
  enquiries: [],
  page: 1,
  limit: 20,
  total: 0,
  detail: null,
  statsStatus: "idle",
  listStatus: "idle",
  detailStatus: "idle",
  error: null,
};

const slice = createSlice({
  name: "monitoringEnquiries",
  initialState,
  reducers: {
    // Closing the detail drawer must drop the row it held, or reopening another one
    // flashes the previous enquiry while its fetch is in flight.
    clearDetail(state) {
      state.detail = null;
      state.detailStatus = "idle";
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchEnquiryStats.pending, (state) => {
        state.statsStatus = "loading";
      })
      .addCase(fetchEnquiryStats.fulfilled, (state, action) => {
        state.statsStatus = "idle";
        state.stats = action.payload;
      })
      .addCase(fetchEnquiryStats.rejected, (state, action) => {
        state.statsStatus = "failed";
        state.error = action.error.message ?? "Could not load enquiry stats.";
      })

      .addCase(fetchEnquiries.pending, (state) => {
        state.listStatus = "loading";
      })
      .addCase(fetchEnquiries.fulfilled, (state, action) => {
        state.listStatus = "idle";
        state.enquiries = action.payload.data;
        state.page = action.payload.meta.page;
        state.limit = action.payload.meta.limit;
        state.total = action.payload.meta.total;
      })
      .addCase(fetchEnquiries.rejected, (state, action) => {
        state.listStatus = "failed";
        state.error = action.error.message ?? "Could not load enquiries.";
      })

      .addCase(fetchEnquiryDetail.pending, (state) => {
        state.detailStatus = "loading";
        state.detail = null;
      })
      .addCase(fetchEnquiryDetail.fulfilled, (state, action) => {
        state.detailStatus = "idle";
        state.detail = action.payload;
      })
      .addCase(fetchEnquiryDetail.rejected, (state, action) => {
        state.detailStatus = "failed";
        state.error = action.error.message ?? "Could not load this enquiry.";
      });
  },
});

export const { clearDetail } = slice.actions;
export const enquiriesReducer = slice.reducer;
