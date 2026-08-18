import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { referralsApi } from "../apis";
import type { MyReferrals } from "../apis/types";

export const fetchMyReferrals = createAsyncThunk("referrals/fetchMyReferrals", () =>
  referralsApi.getMyReferrals(),
);

type ReferralsState = {
  data: MyReferrals | null;
  status: "idle" | "loading" | "failed";
  error: string | null;
};

const initialState: ReferralsState = { data: null, status: "idle", error: null };

const referralsSlice = createSlice({
  name: "referrals",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchMyReferrals.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchMyReferrals.fulfilled, (state, action) => {
        state.status = "idle";
        state.data = action.payload;
      })
      .addCase(fetchMyReferrals.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load referrals.";
      });
  },
});

export const referralsReducer = referralsSlice.reducer;
