import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { maraAgentsApi } from "../apis";
import type { MaraAgentSummary } from "../apis/types";

export const fetchMaraAgents = createAsyncThunk("dataMaraAgents/fetch", () => maraAgentsApi.getAgents());

type MaraAgentsState = {
  agents: MaraAgentSummary[];
  status: "idle" | "loading" | "failed";
  error: string | null;
};

const initialState: MaraAgentsState = { agents: [], status: "idle", error: null };

const maraAgentsSlice = createSlice({
  name: "dataMaraAgents",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchMaraAgents.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchMaraAgents.fulfilled, (state, action) => {
        state.status = "idle";
        state.agents = action.payload;
      })
      .addCase(fetchMaraAgents.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load MARA agents.";
      });
  },
});

export const maraAgentsReducer = maraAgentsSlice.reducer;
