import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { moderationApi } from "../apis";
import type { ModerationFlag } from "../apis/types";

export const fetchModerationFlags = createAsyncThunk("monitoringModeration/fetch", () => moderationApi.getFlags());

type ModerationState = {
  flags: ModerationFlag[];
  status: "idle" | "loading" | "failed";
  error: string | null;
};

const initialState: ModerationState = { flags: [], status: "idle", error: null };

const moderationSlice = createSlice({
  name: "monitoringModeration",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchModerationFlags.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchModerationFlags.fulfilled, (state, action) => {
        state.status = "idle";
        state.flags = action.payload;
      })
      .addCase(fetchModerationFlags.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load moderation flags.";
      });
  },
});

export const moderationReducer = moderationSlice.reducer;
