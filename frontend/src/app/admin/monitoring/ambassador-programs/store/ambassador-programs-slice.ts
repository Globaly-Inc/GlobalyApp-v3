import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { ambassadorProgramsApi } from "../apis";
import type { AmbassadorProgram } from "../apis/types";

export const fetchAmbassadorPrograms = createAsyncThunk("monitoringAmbassadorPrograms/fetch", () =>
  ambassadorProgramsApi.getPrograms(),
);

type AmbassadorProgramsState = {
  programs: AmbassadorProgram[];
  status: "idle" | "loading" | "failed";
  error: string | null;
};

const initialState: AmbassadorProgramsState = { programs: [], status: "idle", error: null };

const ambassadorProgramsSlice = createSlice({
  name: "monitoringAmbassadorPrograms",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchAmbassadorPrograms.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchAmbassadorPrograms.fulfilled, (state, action) => {
        state.status = "idle";
        state.programs = action.payload;
      })
      .addCase(fetchAmbassadorPrograms.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load ambassador programs.";
      });
  },
});

export const ambassadorProgramsReducer = ambassadorProgramsSlice.reducer;
