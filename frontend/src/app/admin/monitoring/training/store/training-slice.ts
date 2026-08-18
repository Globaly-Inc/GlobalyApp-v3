import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { trainingApi } from "../apis";
import type {
  AdminTrainingProgram,
  AdminTrainingStats,
  ListTrainingProgramsParams,
} from "../apis/types";

export const fetchTrainingPrograms = createAsyncThunk(
  "monitoringTraining/fetchList",
  (params: ListTrainingProgramsParams = {}) => trainingApi.getPrograms(params),
);

export const fetchTrainingStats = createAsyncThunk("monitoringTraining/fetchStats", () =>
  trainingApi.getStats(),
);

type Status = "idle" | "loading" | "failed";

type TrainingState = {
  programs: AdminTrainingProgram[];
  stats: AdminTrainingStats | null;
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  // Per-region status, so a failing stats call still leaves the table rendered.
  listStatus: Status;
  statsStatus: Status;
  error: string | null;
};

const initialState: TrainingState = {
  programs: [],
  stats: null,
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 0,
  listStatus: "idle",
  statsStatus: "idle",
  error: null,
};

const trainingSlice = createSlice({
  name: "monitoringTraining",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchTrainingPrograms.pending, (state) => {
        state.listStatus = "loading";
        state.error = null;
      })
      .addCase(fetchTrainingPrograms.fulfilled, (state, action) => {
        state.listStatus = "idle";
        state.programs = action.payload.data;
        state.page = action.payload.meta.page;
        state.limit = action.payload.meta.limit;
        state.total = action.payload.meta.total;
        state.totalPages = action.payload.meta.totalPages;
      })
      .addCase(fetchTrainingPrograms.rejected, (state, action) => {
        state.listStatus = "failed";
        state.error = action.error.message ?? "Failed to load training programs.";
      })
      .addCase(fetchTrainingStats.pending, (state) => {
        state.statsStatus = "loading";
      })
      .addCase(fetchTrainingStats.fulfilled, (state, action) => {
        state.statsStatus = "idle";
        state.stats = action.payload;
      })
      .addCase(fetchTrainingStats.rejected, (state) => {
        state.statsStatus = "failed";
      });
  },
});

export const trainingReducer = trainingSlice.reducer;
