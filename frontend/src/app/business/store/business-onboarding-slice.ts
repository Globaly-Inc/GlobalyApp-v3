import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { businessApi } from "../apis";
import type { BusinessProfile, BusinessProfilePatch, BusinessRegisterInput } from "../apis/types";

// Result isn't stored in this slice's state — a successful registration hard-navigates
// to /business (same reload rationale the business switcher already uses), so there's
// no stale profile/org state left behind to reconcile.
export const registerBusiness = createAsyncThunk(
  "businessOnboarding/registerBusiness",
  (input: BusinessRegisterInput) => businessApi.registerBusiness(input),
);

export const fetchMyProfile = createAsyncThunk("businessOnboarding/fetchMyProfile", () =>
  businessApi.getMyProfile(),
);

export const updateMyProfile = createAsyncThunk(
  "businessOnboarding/updateMyProfile",
  (patch: BusinessProfilePatch) => businessApi.updateMyProfile(patch),
);

type BusinessOnboardingState = {
  profile: BusinessProfile | null;
  status: "idle" | "loading" | "saving" | "failed";
  error: string | null;
};

const initialState: BusinessOnboardingState = { profile: null, status: "idle", error: null };

const businessOnboardingSlice = createSlice({
  name: "businessOnboarding",
  initialState,
  reducers: {
    resetBusinessOnboardingError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchMyProfile.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchMyProfile.fulfilled, (state, action) => {
        state.status = "idle";
        state.profile = action.payload;
      })
      .addCase(fetchMyProfile.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load your business profile.";
      })
      .addCase(updateMyProfile.pending, (state) => {
        state.status = "saving";
        state.error = null;
      })
      .addCase(updateMyProfile.fulfilled, (state, action) => {
        state.status = "idle";
        state.profile = action.payload;
      })
      .addCase(updateMyProfile.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to save.";
      })
      .addCase(registerBusiness.pending, (state) => {
        state.status = "saving";
        state.error = null;
      })
      .addCase(registerBusiness.fulfilled, (state) => {
        state.status = "idle";
      })
      .addCase(registerBusiness.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to create business.";
      });
  },
});

export const { resetBusinessOnboardingError } = businessOnboardingSlice.actions;
export const businessOnboardingReducer = businessOnboardingSlice.reducer;
