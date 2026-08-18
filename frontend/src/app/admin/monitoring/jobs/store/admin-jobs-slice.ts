import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { adminJobsApi } from "../apis";
import type { AdminJob, AdminJobStats, ListJobsParams } from "../apis/types";

export const fetchAdminJobs = createAsyncThunk(
  "monitoringJobs/fetchList",
  (params: ListJobsParams = {}) => adminJobsApi.getJobs(params),
);

export const fetchAdminJobStats = createAsyncThunk("monitoringJobs/fetchStats", () =>
  adminJobsApi.getStats(),
);

type Status = "idle" | "loading" | "failed";

type JobsState = {
  jobs: AdminJob[];
  stats: AdminJobStats | null;
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  // Per-region status, so a failing stats call still leaves the table rendered.
  listStatus: Status;
  statsStatus: Status;
  error: string | null;
};

const initialState: JobsState = {
  jobs: [],
  stats: null,
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 0,
  listStatus: "idle",
  statsStatus: "idle",
  error: null,
};

const adminJobsSlice = createSlice({
  name: "monitoringJobs",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchAdminJobs.pending, (state) => {
        state.listStatus = "loading";
        state.error = null;
      })
      .addCase(fetchAdminJobs.fulfilled, (state, action) => {
        state.listStatus = "idle";
        state.jobs = action.payload.data;
        state.page = action.payload.meta.page;
        state.limit = action.payload.meta.limit;
        state.total = action.payload.meta.total;
        state.totalPages = action.payload.meta.totalPages;
      })
      .addCase(fetchAdminJobs.rejected, (state, action) => {
        state.listStatus = "failed";
        state.error = action.error.message ?? "Failed to load job postings.";
      })
      .addCase(fetchAdminJobStats.pending, (state) => {
        state.statsStatus = "loading";
      })
      .addCase(fetchAdminJobStats.fulfilled, (state, action) => {
        state.statsStatus = "idle";
        state.stats = action.payload;
      })
      .addCase(fetchAdminJobStats.rejected, (state) => {
        state.statsStatus = "failed";
      });
  },
});

export const adminJobsReducer = adminJobsSlice.reducer;
