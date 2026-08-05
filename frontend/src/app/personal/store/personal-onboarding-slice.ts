import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { personalApi } from "../apis";
import type { StudentProfile, StudentProfilePatch, UpdateSubCategoryParams } from "../apis/types";

export const fetchMyProfile = createAsyncThunk("personalOnboarding/fetchMyProfile", () =>
  personalApi.getMyProfile(),
);

export const updateMyProfile = createAsyncThunk(
  "personalOnboarding/updateMyProfile",
  (patch: StudentProfilePatch) => personalApi.updateMyProfile(patch),
);

export const updateSubCategory = createAsyncThunk(
  "personalOnboarding/updateSubCategory",
  (params: UpdateSubCategoryParams) => personalApi.updateSubCategory(params),
);

type PersonalOnboardingState = {
  profile: StudentProfile | null;
  status: "idle" | "loading" | "saving" | "failed";
  error: string | null;
};

const initialState: PersonalOnboardingState = { profile: null, status: "idle", error: null };

const personalOnboardingSlice = createSlice({
  name: "personalOnboarding",
  initialState,
  reducers: {},
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
        state.error = action.error.message ?? "Failed to load your profile.";
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

export const personalOnboardingReducer = personalOnboardingSlice.reducer;
