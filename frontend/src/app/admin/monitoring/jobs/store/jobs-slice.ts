import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { jobsApi } from "../apis";
import type { JobPosting } from "../apis/types";

type JobsState = {
  jobs: JobPosting[];
  status: "idle" | "loading" | "failed";
  error: string | null;
};

export const fetchJobs = createAsyncThunk("monitoringJobs/fetch", () => jobsApi.getJobs(), {
  // Skip if a fetch is already in flight or has already completed — prevents the
  // duplicate GET /admin/jobs that React StrictMode's double-effect-mount triggers.
  condition: (_, { getState }) => (getState() as { monitoringJobs: JobsState }).monitoringJobs.status === "idle",
});

const initialState: JobsState = { jobs: [], status: "idle", error: null };

const jobsSlice = createSlice({
  name: "monitoringJobs",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchJobs.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchJobs.fulfilled, (state, action) => {
        state.status = "idle";
        state.jobs = action.payload;
      })
      .addCase(fetchJobs.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load jobs.";
      });
  },
});

export const jobsReducer = jobsSlice.reducer;
