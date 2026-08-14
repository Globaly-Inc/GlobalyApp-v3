import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { maraAgentsApi } from "../apis";
import type { MaraExtraction, MaraExtractionStatus } from "../apis/types";

export const fetchMaraAgents = createAsyncThunk(
  "dataMaraAgents/fetch",
  (status?: MaraExtractionStatus) => maraAgentsApi.listMaraAgents(status),
);

export const discardMaraAgent = createAsyncThunk("dataMaraAgents/discard", async (id: string) => {
  await maraAgentsApi.discardMaraAgent(id);
  return id;
});

export const promoteMaraAgent = createAsyncThunk("dataMaraAgents/promote", async (id: string) => {
  await maraAgentsApi.promoteMaraAgent(id);
  return id;
});

export const launchMaraExtraction = createAsyncThunk("dataMaraAgents/launch", (urls: string[]) =>
  maraAgentsApi.launchExtraction(urls),
);

type MaraAgentsState = {
  agents: MaraExtraction[];
  status: "idle" | "loading" | "failed";
  error: string | null;
  statusFilter: MaraExtractionStatus | "all";
};

const initialState: MaraAgentsState = { agents: [], status: "idle", error: null, statusFilter: "pending" };

const maraAgentsSlice = createSlice({
  name: "dataMaraAgents",
  initialState,
  reducers: {
    setStatusFilter(state, action: PayloadAction<MaraAgentsState["statusFilter"]>) {
      state.statusFilter = action.payload;
    },
  },
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
      })
      .addCase(discardMaraAgent.fulfilled, (state, action) => {
        state.agents = state.agents.map((a) =>
          a.id === action.payload ? { ...a, status: "discarded" as const } : a,
        );
      })
      .addCase(promoteMaraAgent.fulfilled, (state, action) => {
        state.agents = state.agents.map((a) =>
          a.id === action.payload ? { ...a, status: "promoted" as const } : a,
        );
      });
  },
});

export const { setStatusFilter } = maraAgentsSlice.actions;
export const maraAgentsReducer = maraAgentsSlice.reducer;
