import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { logsApi } from "../apis";
import type { AuditLogEntry, ListAuditLogsParams } from "../apis/types";

export const fetchAuditLogs = createAsyncThunk("monitoringLogs/fetch", (params: ListAuditLogsParams = {}) =>
  logsApi.getLogs(params),
);

type LogsState = {
  logs: AuditLogEntry[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  status: "idle" | "loading" | "failed";
  error: string | null;
};

const initialState: LogsState = {
  logs: [],
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 0,
  status: "idle",
  error: null,
};

const logsSlice = createSlice({
  name: "monitoringLogs",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchAuditLogs.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchAuditLogs.fulfilled, (state, action) => {
        state.status = "idle";
        state.logs = action.payload.data;
        state.page = action.payload.meta.page;
        state.limit = action.payload.meta.limit;
        state.total = action.payload.meta.total;
        state.totalPages = action.payload.meta.totalPages;
      })
      .addCase(fetchAuditLogs.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load audit logs.";
      });
  },
});

export const logsReducer = logsSlice.reducer;
