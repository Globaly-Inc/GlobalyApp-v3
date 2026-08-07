import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { logsApi } from "../apis";
import type { AuditLogEntry } from "../apis/types";

export const fetchAuditLogs = createAsyncThunk("monitoringLogs/fetch", () => logsApi.getLogs());

type LogsState = {
  logs: AuditLogEntry[];
  status: "idle" | "loading" | "failed";
  error: string | null;
};

const initialState: LogsState = { logs: [], status: "idle", error: null };

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
        state.logs = action.payload;
      })
      .addCase(fetchAuditLogs.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load audit logs.";
      });
  },
});

export const logsReducer = logsSlice.reducer;
