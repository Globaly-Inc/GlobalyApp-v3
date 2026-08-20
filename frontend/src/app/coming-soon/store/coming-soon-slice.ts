import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { fieldErrorsFrom } from "@/lib/api/http";
import { comingSoonApi } from "../apis";
import type { RegisterParams } from "../apis/types";

type RejectPayload = { message: string; fields: Record<string, string> };

// createAsyncThunk's default rejected action strips custom error properties
// (only name/message/stack survive serialization) — rejectWithValue keeps
// the Zod `details` from ApiError so per-field messages reach the form.
export const registerForLaunch = createAsyncThunk<void, RegisterParams, { rejectValue: RejectPayload }>(
  "comingSoon/register",
  async (params, { rejectWithValue }) => {
    try {
      await comingSoonApi.register(params);
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      return rejectWithValue({ message, fields: fieldErrorsFrom(err) });
    }
  },
);

type ComingSoonState = {
  status: "idle" | "submitting" | "done" | "failed";
  error: string | null;
  fieldErrors: Record<string, string>;
};

const initialState: ComingSoonState = { status: "idle", error: null, fieldErrors: {} };

const comingSoonSlice = createSlice({
  name: "comingSoon",
  initialState,
  reducers: {
    resetComingSoonError(state) {
      state.error = null;
      state.fieldErrors = {};
      state.status = "idle";
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(registerForLaunch.pending, (state) => {
        state.status = "submitting";
        state.error = null;
        state.fieldErrors = {};
      })
      .addCase(registerForLaunch.fulfilled, (state) => {
        state.status = "done";
      })
      .addCase(registerForLaunch.rejected, (state, action) => {
        state.status = "failed";
        const fields = action.payload?.fields ?? {};
        state.fieldErrors = fields;
        // Field-specific messages render under each input — don't also show
        // a redundant generic banner when we have those.
        state.error = Object.keys(fields).length > 0
          ? null
          : action.payload?.message ?? action.error.message ?? "Something went wrong. Please try again.";
      });
  },
});

export const { resetComingSoonError } = comingSoonSlice.actions;
export const comingSoonReducer = comingSoonSlice.reducer;
