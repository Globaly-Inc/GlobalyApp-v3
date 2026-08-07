import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { agentcisImportApi } from "../apis";
import type { AgentcisImportBatch } from "../apis/types";

export const fetchAgentcisBatches = createAsyncThunk("dataAgentcisImport/fetch", () => agentcisImportApi.getBatches());

type AgentcisImportState = {
  batches: AgentcisImportBatch[];
  status: "idle" | "loading" | "failed";
  error: string | null;
};

const initialState: AgentcisImportState = { batches: [], status: "idle", error: null };

const agentcisImportSlice = createSlice({
  name: "dataAgentcisImport",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchAgentcisBatches.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchAgentcisBatches.fulfilled, (state, action) => {
        state.status = "idle";
        state.batches = action.payload;
      })
      .addCase(fetchAgentcisBatches.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load import batches.";
      });
  },
});

export const agentcisImportReducer = agentcisImportSlice.reducer;
