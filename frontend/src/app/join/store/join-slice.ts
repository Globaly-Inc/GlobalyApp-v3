import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { joinApi } from "../apis";
import type { ReferralLookup } from "../apis/types";

export const resolveInvite = createAsyncThunk("join/resolveInvite", async (code: string) =>
  joinApi.lookup(code),
);

type JoinState = {
  lookup: ReferralLookup | null;
  status: "idle" | "loading" | "invalid" | "ready";
};

const initialState: JoinState = { lookup: null, status: "idle" };

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
        state.lookup = action.payload;
      })
      // An unknown or unusable code is not an error state to apologise for — it just means the invite
      // does not apply, and sign-up continues normally.
      .addCase(resolveInvite.rejected, (state) => {
        state.status = "invalid";
      });
  },
});

export const joinReducer = joinSlice.reducer;
