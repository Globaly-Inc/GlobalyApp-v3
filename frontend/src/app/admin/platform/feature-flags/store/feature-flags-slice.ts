import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { featureFlagsApi } from "../apis";
import type { FeatureFlag } from "../apis/types";

export const fetchFlags = createAsyncThunk("platformFeatureFlags/fetch", () => featureFlagsApi.getFlags());

export const toggleFlag = createAsyncThunk(
  "platformFeatureFlags/toggle",
  (args: { id: string; enabled: boolean }) => featureFlagsApi.toggleFlag(args.id, args.enabled),
);

type FeatureFlagsState = {
  flags: FeatureFlag[];
  status: "idle" | "loading" | "failed";
  error: string | null;
};

const initialState: FeatureFlagsState = { flags: [], status: "idle", error: null };

const featureFlagsSlice = createSlice({
  name: "platformFeatureFlags",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchFlags.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchFlags.fulfilled, (state, action) => {
        state.status = "idle";
        state.flags = action.payload;
      })
      .addCase(fetchFlags.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load feature flags.";
      })
      .addCase(toggleFlag.fulfilled, (state, action) => {
        state.flags = state.flags.map((f) => (f.id === action.payload.id ? action.payload : f));
      });
  },
});

export const featureFlagsReducer = featureFlagsSlice.reducer;
