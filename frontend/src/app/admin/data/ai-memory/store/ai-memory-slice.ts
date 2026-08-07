import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { aiMemoryApi } from "../apis";
import type { SiteProfileSummary } from "../apis/types";

export const fetchSiteProfiles = createAsyncThunk("dataAiMemory/fetch", () => aiMemoryApi.getSiteProfiles());

type AiMemoryState = {
  profiles: SiteProfileSummary[];
  status: "idle" | "loading" | "failed";
  error: string | null;
};

const initialState: AiMemoryState = { profiles: [], status: "idle", error: null };

const aiMemorySlice = createSlice({
  name: "dataAiMemory",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchSiteProfiles.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchSiteProfiles.fulfilled, (state, action) => {
        state.status = "idle";
        state.profiles = action.payload;
      })
      .addCase(fetchSiteProfiles.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load site profiles.";
      });
  },
});

export const aiMemoryReducer = aiMemorySlice.reducer;
