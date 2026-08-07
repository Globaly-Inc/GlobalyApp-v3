import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { trainingApi } from "../apis";
import type { TrainingProgram } from "../apis/types";

export const fetchTrainingPrograms = createAsyncThunk("monitoringTraining/fetch", () => trainingApi.getPrograms());

type TrainingState = {
  programs: TrainingProgram[];
  status: "idle" | "loading" | "failed";
  error: string | null;
};

const initialState: TrainingState = { programs: [], status: "idle", error: null };

const trainingSlice = createSlice({
  name: "monitoringTraining",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchTrainingPrograms.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchTrainingPrograms.fulfilled, (state, action) => {
        state.status = "idle";
        state.programs = action.payload;
      })
      .addCase(fetchTrainingPrograms.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load training programs.";
      });
  },
});

export const trainingReducer = trainingSlice.reducer;
