import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { extractedDataApi } from "../apis";
import type { ExtractedJob } from "../apis/types";

export const fetchExtractedJobs = createAsyncThunk("dataExtractedData/fetch", () =>
  extractedDataApi.getExtractedJobs(),
);

export const promoteExtractedJob = createAsyncThunk("dataExtractedData/promote", async (id: string) => {
  await extractedDataApi.promoteJob(id);
  return id;
});

type ExtractedDataState = {
  jobs: ExtractedJob[];
  status: "idle" | "loading" | "failed";
  error: string | null;
};

const initialState: ExtractedDataState = { jobs: [], status: "idle", error: null };

const extractedDataSlice = createSlice({
  name: "dataExtractedData",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchExtractedJobs.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchExtractedJobs.fulfilled, (state, action) => {
        state.status = "idle";
        state.jobs = action.payload;
      })
      .addCase(fetchExtractedJobs.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load extracted data.";
      })
      .addCase(promoteExtractedJob.fulfilled, (state, action) => {
        state.jobs = state.jobs.map((j) =>
          j.id === action.payload ? { ...j, status: "exported" } : j,
        );
      });
  },
});

export const extractedDataReducer = extractedDataSlice.reducer;
