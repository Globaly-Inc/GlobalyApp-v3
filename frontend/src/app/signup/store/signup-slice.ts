import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { signupApi } from "../apis";
import type { Lead } from "../apis/types";

export const fetchLeads = createAsyncThunk("signup/fetchLeads", () => signupApi.getLeads());

type SignupState = {
  leads: Lead[];
  status: "idle" | "loading" | "failed";
};

const initialState: SignupState = { leads: [], status: "idle" };

const signupSlice = createSlice({
  name: "signup",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchLeads.pending, (state) => {
        state.status = "loading";
      })
      .addCase(fetchLeads.fulfilled, (state, action) => {
        state.status = "idle";
        state.leads = action.payload;
      })
      .addCase(fetchLeads.rejected, (state) => {
        state.status = "failed";
      });
  },
});

export const signupReducer = signupSlice.reducer;
