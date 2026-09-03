import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { agentcisImportApi } from "../apis";
import type { AgentCISResult, AgentcisJob, BulkCrawlResult, ImportResult } from "../apis/types";

export const searchAgentCIS = createAsyncThunk("dataAgentcisImport/search", (query: string) =>
  agentcisImportApi.search(query),
);

export const importAgentCIS = createAsyncThunk("dataAgentcisImport/import", (ids: string[]) =>
  agentcisImportApi.importInstitutions(ids),
);

export const bulkCrawlAgentCIS = createAsyncThunk(
  "dataAgentcisImport/bulkCrawl",
  ({ startPage, maxPages }: { startPage: number; maxPages: number }) =>
    agentcisImportApi.bulkCrawl(startPage, maxPages),
);

export const fetchAgentcisJobs = createAsyncThunk("dataAgentcisImport/fetchJobs", () =>
  agentcisImportApi.getJobs(),
);

export const deleteAgentcisJob = createAsyncThunk("dataAgentcisImport/deleteJob", (id: string) =>
  agentcisImportApi.deleteJob(id).then(() => id),
);

type AgentcisImportState = {
  searchResults: AgentCISResult[];
  // Stored as strings — AgentCIS ids can be string or number from the API.
  selectedIds: string[];
  searchStatus: "idle" | "loading" | "failed";
  importStatus: "idle" | "loading" | "failed";
  importResult: ImportResult | null;
  bulkCrawlStatus: "idle" | "loading" | "failed";
  bulkCrawlResult: BulkCrawlResult | null;
  error: string | null;
  jobs: AgentcisJob[];
  jobsStatus: "idle" | "loading" | "failed";
};

const initialState: AgentcisImportState = {
  searchResults: [],
  selectedIds: [],
  searchStatus: "idle",
  importStatus: "idle",
  importResult: null,
  bulkCrawlStatus: "idle",
  bulkCrawlResult: null,
  error: null,
  jobs: [],
  jobsStatus: "idle",
};

const agentcisImportSlice = createSlice({
  name: "dataAgentcisImport",
  initialState,
  reducers: {
    toggleSelection: (state, action: { payload: string }) => {
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
    clearBulkCrawlResult: (state) => {
      state.bulkCrawlResult = null;
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
      })
      .addCase(bulkCrawlAgentCIS.pending, (state) => {
        state.bulkCrawlStatus = "loading";
        state.error = null;
      })
      .addCase(bulkCrawlAgentCIS.fulfilled, (state, action) => {
        state.bulkCrawlStatus = "idle";
        state.bulkCrawlResult = action.payload;
      })
      .addCase(bulkCrawlAgentCIS.rejected, (state, action) => {
        state.bulkCrawlStatus = "failed";
        state.error = action.error.message ?? "Bulk crawl failed.";
      })
      .addCase(fetchAgentcisJobs.pending, (state) => {
        if (state.jobs.length === 0) state.jobsStatus = "loading";
      })
      .addCase(fetchAgentcisJobs.fulfilled, (state, action) => {
        state.jobsStatus = "idle";
        state.jobs = action.payload;
      })
      .addCase(fetchAgentcisJobs.rejected, (state) => {
        state.jobsStatus = "failed";
      })
      .addCase(deleteAgentcisJob.fulfilled, (state, action) => {
        state.jobs = state.jobs.filter((j) => j.id !== action.payload);
      });
  },
});

export const { toggleSelection, clearSelection, clearImportResult, clearBulkCrawlResult } = agentcisImportSlice.actions;
export const agentcisImportReducer = agentcisImportSlice.reducer;
