import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { joinApi } from "../apis";
import type { ReferralConfig, ReferralLookup } from "../apis/types";

/** Resolve the code and fetch reward amounts together — the landing page needs both to say anything. */
export const resolveInvite = createAsyncThunk("join/resolveInvite", async (code: string) => {
  const [lookup, config] = await Promise.all([joinApi.lookup(code), joinApi.getConfig()]);
  return { lookup, config };
});

type JoinState = {
  lookup: ReferralLookup | null;
  config: ReferralConfig | null;
  status: "idle" | "loading" | "invalid" | "ready";
};

const initialState: JoinState = { lookup: null, config: null, status: "idle" };

const joinSlice = createSlice({
  name: "join",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(resolveInvite.pending, (state) => {
        state.status = "loading";
      })
      .addCase(resolveInvite.fulfilled, (state, action) => {
        state.status = "ready";
        state.lookup = action.payload.lookup;
        state.config = action.payload.config;
      })
      // An unknown or unusable code is not an error state to apologise for — it just means the invite
      // does not apply, and sign-up continues normally.
      .addCase(resolveInvite.rejected, (state) => {
        state.status = "invalid";
      });
  },
});

export const joinReducer = joinSlice.reducer;
