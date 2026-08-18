import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { ambassadorProgramsApi } from "../apis";
import type {
  AdminAmbassadorProgram,
  AdminAmbassadorStats,
  ListAmbassadorProgramsParams,
} from "../apis/types";

export const fetchAmbassadorPrograms = createAsyncThunk(
  "monitoringAmbassadorPrograms/fetchList",
  (params: ListAmbassadorProgramsParams = {}) => ambassadorProgramsApi.getPrograms(params),
);

export const fetchAmbassadorStats = createAsyncThunk(
  "monitoringAmbassadorPrograms/fetchStats",
  () => ambassadorProgramsApi.getStats(),
);

type Status = "idle" | "loading" | "failed";

type AmbassadorProgramsState = {
  programs: AdminAmbassadorProgram[];
  stats: AdminAmbassadorStats | null;
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  // Per-region status, so a failing stats call still leaves the table rendered.
  listStatus: Status;
  statsStatus: Status;
  error: string | null;
};

const initialState: AmbassadorProgramsState = {
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

const ambassadorProgramsSlice = createSlice({
  name: "monitoringAmbassadorPrograms",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchAmbassadorPrograms.pending, (state) => {
        state.listStatus = "loading";
        state.error = null;
      })
      .addCase(fetchAmbassadorPrograms.fulfilled, (state, action) => {
        state.listStatus = "idle";
        state.programs = action.payload.data;
        state.page = action.payload.meta.page;
        state.limit = action.payload.meta.limit;
        state.total = action.payload.meta.total;
        state.totalPages = action.payload.meta.totalPages;
      })
      .addCase(fetchAmbassadorPrograms.rejected, (state, action) => {
        state.listStatus = "failed";
        state.error = action.error.message ?? "Failed to load ambassador programs.";
      })
      .addCase(fetchAmbassadorStats.pending, (state) => {
        state.statsStatus = "loading";
      })
      .addCase(fetchAmbassadorStats.fulfilled, (state, action) => {
        state.statsStatus = "idle";
        state.stats = action.payload;
      })
      .addCase(fetchAmbassadorStats.rejected, (state) => {
        state.statsStatus = "failed";
      });
  },
});

export const ambassadorProgramsReducer = ambassadorProgramsSlice.reducer;
