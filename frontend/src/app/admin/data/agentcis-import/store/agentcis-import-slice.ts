import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { agentcisImportApi } from "../apis";
import type { AgentCISResult, ImportResult } from "../apis/types";

export const searchAgentCIS = createAsyncThunk("dataAgentcisImport/search", (query: string) =>
  agentcisImportApi.search(query),
);

export const importAgentCIS = createAsyncThunk("dataAgentcisImport/import", (ids: number[]) =>
  agentcisImportApi.importInstitutions(ids),
);

type AgentcisImportState = {
  searchResults: AgentCISResult[];
  // Array, not a Set — redux state has to stay serializable.
  selectedIds: number[];
  searchStatus: "idle" | "loading" | "failed";
  importStatus: "idle" | "loading" | "failed";
  importResult: ImportResult | null;
  error: string | null;
};

const initialState: AgentcisImportState = {
  searchResults: [],
  selectedIds: [],
  searchStatus: "idle",
  importStatus: "idle",
  importResult: null,
  error: null,
};

const agentcisImportSlice = createSlice({
  name: "dataAgentcisImport",
  initialState,
  reducers: {
    toggleSelection: (state, action: { payload: number }) => {
      const at = state.selectedIds.indexOf(action.payload);
      if (at === -1) state.selectedIds.push(action.payload);
      else state.selectedIds.splice(at, 1);
    },
    clearSelection: (state) => {
      state.selectedIds = [];
    },
    clearImportResult: (state) => {
      state.importResult = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(searchAgentCIS.pending, (state) => {
        state.searchStatus = "loading";
        state.error = null;
      })
      .addCase(searchAgentCIS.fulfilled, (state, action) => {
        state.searchStatus = "idle";
        state.searchResults = action.payload;
      })
      .addCase(searchAgentCIS.rejected, (state, action) => {
        state.searchStatus = "failed";
        state.error = action.error.message ?? "Search failed.";
      })
      .addCase(importAgentCIS.pending, (state) => {
        state.importStatus = "loading";
        state.error = null;
      })
      .addCase(importAgentCIS.fulfilled, (state, action) => {
        state.importStatus = "idle";
        state.importResult = action.payload;
        state.selectedIds = [];
      })
      .addCase(importAgentCIS.rejected, (state, action) => {
        state.importStatus = "failed";
        state.error = action.error.message ?? "Import failed.";
      });
  },
});

export const { toggleSelection, clearSelection, clearImportResult } = agentcisImportSlice.actions;
export const agentcisImportReducer = agentcisImportSlice.reducer;
