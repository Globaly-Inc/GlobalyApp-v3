import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { aiExtractionApi } from "../apis";
import type { AiExtractionJob } from "../apis/types";

export const fetchAiExtractionJobs = createAsyncThunk("dataAiExtraction/fetch", () => aiExtractionApi.getInProgressJobs());

export const pauseAiJob = createAsyncThunk("dataAiExtraction/pause", async (id: string) => {
  await aiExtractionApi.pauseJob(id);
  return id;
});

export const resumeAiJob = createAsyncThunk("dataAiExtraction/resume", async (id: string) => {
  await aiExtractionApi.resumeJob(id);
  return id;
});

export const deleteAiJob = createAsyncThunk("dataAiExtraction/delete", async (id: string) => {
  await aiExtractionApi.deleteJob(id);
  return id;
});

export const declineAiJob = createAsyncThunk("dataAiExtraction/decline", async (id: string) => {
  await aiExtractionApi.declineJob(id);
  return id;
});

type AiExtractionState = {
  jobs: AiExtractionJob[];
  status: "idle" | "loading" | "failed";
  error: string | null;
};

const initialState: AiExtractionState = { jobs: [], status: "idle", error: null };

const aiExtractionSlice = createSlice({
  name: "dataAiExtraction",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchAiExtractionJobs.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchAiExtractionJobs.fulfilled, (state, action) => {
        state.status = "idle";
        state.jobs = action.payload;
      })
      .addCase(fetchAiExtractionJobs.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load AI extraction jobs.";
      })
      .addCase(pauseAiJob.fulfilled, (state, action) => {
        state.jobs = state.jobs.map((j) => (j.id === action.payload ? { ...j, status: "paused" } : j));
      })
      .addCase(resumeAiJob.fulfilled, (state, action) => {
        state.jobs = state.jobs.map((j) => (j.id === action.payload ? { ...j, status: "extracting" } : j));
      })
      .addCase(deleteAiJob.fulfilled, (state, action) => {
        state.jobs = state.jobs.filter((j) => j.id !== action.payload);
      })
      .addCase(declineAiJob.fulfilled, (state, action) => {
        state.jobs = state.jobs.map((j) => (j.id === action.payload ? { ...j, status: "declined" } : j));
      });
  },
});

export const aiExtractionReducer = aiExtractionSlice.reducer;
