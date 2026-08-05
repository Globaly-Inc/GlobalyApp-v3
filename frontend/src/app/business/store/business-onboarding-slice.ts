import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { businessApi } from "../apis";
import type { BusinessProfile, BusinessProfilePatch, UpdateSubCategoryParams } from "../apis/types";

export const updateSubCategory = createAsyncThunk(
  "businessOnboarding/updateSubCategory",
  (params: UpdateSubCategoryParams) => businessApi.updateSubCategory(params),
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
      });
  },
});

export const { resetBusinessOnboardingError } = businessOnboardingSlice.actions;
export const businessOnboardingReducer = businessOnboardingSlice.reducer;
