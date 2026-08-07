import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { aiExtractionApi } from "../apis";
import type { ExtractionProgress } from "../apis/types";

export const fetchAiExtractionJobs = createAsyncThunk("dataAiExtraction/fetch", () => aiExtractionApi.getInProgressJobs());

type AiExtractionState = {
  jobs: ExtractionProgress[];
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
        state.error = action.error.message ?? "Failed to load extraction progress.";
      });
  },
});

export const aiExtractionReducer = aiExtractionSlice.reducer;
