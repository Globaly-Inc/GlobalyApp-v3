import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { allExtractionsApi } from "../apis";
import type { CreateJobParams, ExtractionJob, JobFull } from "../apis/types";

export const fetchAllExtractions = createAsyncThunk("dataAllExtractions/fetch", () => allExtractionsApi.getJobs());

export const fetchJobDetail = createAsyncThunk("dataAllExtractions/fetchDetail", (id: string) => allExtractionsApi.getJob(id));

export const fetchJobFull = createAsyncThunk("dataAllExtractions/fetchFull", (id: string) => allExtractionsApi.getJobFull(id));

export const stopAllExtraction = createAsyncThunk("dataAllExtractions/stopAll", async (id: string) => {
  await allExtractionsApi.stopAllExtraction(id);
  return id;
});

export const resetPipeline = createAsyncThunk("dataAllExtractions/resetPipeline", async (id: string) => {
  await allExtractionsApi.resetPipeline(id);
  return id;
});

export const createJob = createAsyncThunk("dataAllExtractions/create", (params: CreateJobParams) =>
  allExtractionsApi.createJob(params),
);

export const declineJob = createAsyncThunk("dataAllExtractions/decline", async (id: string) => {
  await allExtractionsApi.declineJob(id);
  return id;
});

export const deleteJob = createAsyncThunk("dataAllExtractions/delete", async (id: string) => {
  await allExtractionsApi.deleteJob(id);
  return id;
});

export const pauseJob = createAsyncThunk("dataAllExtractions/pause", async (id: string) => {
  await allExtractionsApi.pauseJob(id);
  return id;
});

export const resumeJob = createAsyncThunk("dataAllExtractions/resume", async (id: string) => {
  await allExtractionsApi.resumeJob(id);
  return id;
});

export const promoteJob = createAsyncThunk("dataAllExtractions/promote", async (id: string) => {
  await allExtractionsApi.promoteJob(id);
  return id;
});

type AllExtractionsState = {
  jobs: ExtractionJob[];
  jobDetail: ExtractionJob | null;
  jobFull: JobFull | null;
  jobFullStatus: "idle" | "loading" | "failed";
  status: "idle" | "loading" | "failed";
  error: string | null;
};

const initialState: AllExtractionsState = {
  jobs: [],
  jobDetail: null,
  jobFull: null,
  jobFullStatus: "idle",
  status: "idle",
  error: null,
};

const allExtractionsSlice = createSlice({
  name: "dataAllExtractions",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchAllExtractions.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchAllExtractions.fulfilled, (state, action) => {
        state.status = "idle";
        state.jobs = action.payload;
      })
      .addCase(fetchAllExtractions.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load extraction jobs.";
      })
      .addCase(fetchJobDetail.fulfilled, (state, action) => {
        state.jobDetail = action.payload;
      })
      .addCase(fetchJobFull.pending, (state) => {
        state.jobFullStatus = "loading";
      })
      .addCase(fetchJobFull.fulfilled, (state, action) => {
        state.jobFullStatus = "idle";
        state.jobFull = action.payload;
      })
      .addCase(fetchJobFull.rejected, (state, action) => {
        state.jobFullStatus = "failed";
        state.error = action.error.message ?? "Failed to load extraction job.";
      })
      .addCase(stopAllExtraction.fulfilled, (state, action) => {
        state.jobs = state.jobs.map((j) => (j.id === action.payload ? { ...j, status: "paused" } : j));
        if (state.jobFull?.job.id === action.payload) state.jobFull.job.status = "paused";
      })
      .addCase(resetPipeline.fulfilled, (state, action) => {
        const reset = {
          status: "pending" as const,
          total_pages_found: 0,
          courses_extracted: 0,
          pages_scraped: 0,
          pages_failed: 0,
        };
        state.jobs = state.jobs.map((j) => (j.id === action.payload ? { ...j, ...reset } : j));
        if (state.jobFull?.job.id === action.payload) Object.assign(state.jobFull.job, reset);
      })
      .addCase(createJob.fulfilled, (state, action) => {
        state.jobs = [action.payload, ...state.jobs];
      })
      .addCase(declineJob.fulfilled, (state, action) => {
        state.jobs = state.jobs.map((j) => (j.id === action.payload ? { ...j, status: "declined" } : j));
      })
      .addCase(deleteJob.fulfilled, (state, action) => {
        state.jobs = state.jobs.filter((j) => j.id !== action.payload);
      })
      .addCase(pauseJob.fulfilled, (state, action) => {
        state.jobs = state.jobs.map((j) => (j.id === action.payload ? { ...j, status: "paused" } : j));
      })
      .addCase(resumeJob.fulfilled, (state, action) => {
        state.jobs = state.jobs.map((j) => (j.id === action.payload ? { ...j, status: "extracting" } : j));
      })
      .addCase(promoteJob.fulfilled, (state, action) => {
        state.jobs = state.jobs.map((j) => (j.id === action.payload ? { ...j, status: "exported" } : j));
      });
  },
});

export const allExtractionsReducer = allExtractionsSlice.reducer;
