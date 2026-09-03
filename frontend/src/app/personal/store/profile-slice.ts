import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { personalApi } from "../apis";
import type {
  AcademicTest,
  AcademicTestInput,
  LanguageTest,
  LanguageTestInput,
  Qualification,
  QualificationInput,
  StudentProfile,
  StudentProfilePatch,
  UpdateSubCategoryParams,
  WorkExperience,
  WorkExperienceInput,
} from "../apis/types";
import type { RootState } from "@/lib/store";

export const fetchFullProfile = createAsyncThunk("profile/fetchFullProfile", () => personalApi.getFullProfile(), {
  condition: (_, { getState }) => (getState() as RootState).profile.status !== "loading",
});

export const updateProfile = createAsyncThunk("profile/updateProfile", (patch: StudentProfilePatch) =>
  personalApi.updateMyProfile(patch),
);

export const updateSubCategory = createAsyncThunk("profile/updateSubCategory", (params: UpdateSubCategoryParams) =>
  personalApi.updateSubCategory(params),
);

// Adding/removing a qualification or a language test flips the "Education background" /
// "Test scores" criterion, so the server's completion percentage changes. It lives on
// state.profile, which only fetchFullProfile/updateProfile write — so re-read it, the same
// way the photo upload in profile-view.tsx does. The browser must not recompute the
// percentage itself; the backend is the single source of truth (see backend completion.ts).
// Both criteria are "count > 0", so the edit thunks can't change them and don't refetch.
export const addQualification = createAsyncThunk(
  "profile/addQualification",
  async (input: QualificationInput, { dispatch }) => {
    const row = await personalApi.addQualification(input);
    dispatch(fetchFullProfile());
    return row;
  },
);
export const editQualification = createAsyncThunk(
  "profile/editQualification",
  ({ id, patch }: { id: string; patch: Partial<QualificationInput> }) => personalApi.updateQualification(id, patch),
);
export const removeQualification = createAsyncThunk(
  "profile/removeQualification",
  async (id: string, { dispatch }) => {
    await personalApi.removeQualification(id);
    dispatch(fetchFullProfile());
    return id;
  },
);

export const addLanguageTest = createAsyncThunk(
  "profile/addLanguageTest",
  async (input: LanguageTestInput, { dispatch }) => {
    const row = await personalApi.addLanguageTest(input);
    dispatch(fetchFullProfile());
    return row;
  },
);
export const editLanguageTest = createAsyncThunk(
  "profile/editLanguageTest",
  ({ id, patch }: { id: string; patch: Partial<LanguageTestInput> }) => personalApi.updateLanguageTest(id, patch),
);
export const removeLanguageTest = createAsyncThunk(
  "profile/removeLanguageTest",
  async (id: string, { dispatch }) => {
    await personalApi.removeLanguageTest(id);
    dispatch(fetchFullProfile());
    return id;
  },
);

// Academic tests are not a completion criterion (same as work experience), so no refetch needed.
export const addAcademicTest = createAsyncThunk("profile/addAcademicTest", (input: AcademicTestInput) =>
  personalApi.addAcademicTest(input),
);
export const editAcademicTest = createAsyncThunk(
  "profile/editAcademicTest",
  ({ id, patch }: { id: string; patch: Partial<AcademicTestInput> }) => personalApi.updateAcademicTest(id, patch),
);
export const removeAcademicTest = createAsyncThunk("profile/removeAcademicTest", async (id: string) => {
  await personalApi.removeAcademicTest(id);
  return id;
});

export const addWorkExperience = createAsyncThunk("profile/addWorkExperience", (input: WorkExperienceInput) =>
  personalApi.addWorkExperience(input),
);
export const editWorkExperience = createAsyncThunk(
  "profile/editWorkExperience",
  ({ id, patch }: { id: string; patch: Partial<WorkExperienceInput> }) => personalApi.updateWorkExperience(id, patch),
);
export const removeWorkExperience = createAsyncThunk("profile/removeWorkExperience", async (id: string) => {
  await personalApi.removeWorkExperience(id);
  return id;
});

type ProfileState = {
  profile: StudentProfile | null;
  qualifications: Qualification[];
  languageTests: LanguageTest[];
  academicTests: AcademicTest[];
  workExperiences: WorkExperience[];
  status: "idle" | "loading" | "saving" | "failed";
  error: string | null;
};

const initialState: ProfileState = {
  profile: null,
  qualifications: [],
  languageTests: [],
  academicTests: [],
  workExperiences: [],
  status: "idle",
  error: null,
};

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  const index = list.findIndex((i) => i.id === item.id);
  if (index === -1) return [...list, item];
  return list.map((i) => (i.id === item.id ? item : i));
}

const profileSlice = createSlice({
  name: "profile",
  initialState,
  reducers: {
    resetProfileError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchFullProfile.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchFullProfile.fulfilled, (state, action) => {
        state.status = "idle";
        state.profile = action.payload.profile;
        state.qualifications = action.payload.qualifications;
        state.languageTests = action.payload.languageTests;
        state.academicTests = action.payload.academicTests;
        state.workExperiences = action.payload.workExperiences;
      })
      .addCase(fetchFullProfile.rejected, (state, action) => {
        // A dispatch skipped by the `condition` above is a de-dup, not a failure. Recording it as
        // one flipped status out of "loading" while the real request was still in flight, so the
        // shell dropped its spinner and rendered a profile-less page.
        if (action.meta.condition) return;
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load your profile.";
      })
      .addCase(updateProfile.pending, (state) => {
        state.status = "saving";
        state.error = null;
      })
      .addCase(updateProfile.fulfilled, (state, action) => {
        state.status = "idle";
        state.profile = action.payload;
      })
      .addCase(updateProfile.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Couldn't save. Please try again.";
      })
      .addCase(addQualification.fulfilled, (state, action) => {
        state.qualifications = upsert(state.qualifications, action.payload);
      })
      .addCase(editQualification.fulfilled, (state, action) => {
        state.qualifications = upsert(state.qualifications, action.payload);
      })
      .addCase(removeQualification.fulfilled, (state, action) => {
        state.qualifications = state.qualifications.filter((q) => q.id !== action.payload);
      })
      .addCase(addLanguageTest.fulfilled, (state, action) => {
        state.languageTests = upsert(state.languageTests, action.payload);
      })
      .addCase(editLanguageTest.fulfilled, (state, action) => {
        state.languageTests = upsert(state.languageTests, action.payload);
      })
      .addCase(removeLanguageTest.fulfilled, (state, action) => {
        state.languageTests = state.languageTests.filter((t) => t.id !== action.payload);
      })
      .addCase(addAcademicTest.fulfilled, (state, action) => {
        state.academicTests = upsert(state.academicTests, action.payload);
      })
      .addCase(editAcademicTest.fulfilled, (state, action) => {
        state.academicTests = upsert(state.academicTests, action.payload);
      })
      .addCase(removeAcademicTest.fulfilled, (state, action) => {
        state.academicTests = state.academicTests.filter((t) => t.id !== action.payload);
      })
      .addCase(addWorkExperience.fulfilled, (state, action) => {
        state.workExperiences = upsert(state.workExperiences, action.payload);
      })
      .addCase(editWorkExperience.fulfilled, (state, action) => {
        state.workExperiences = upsert(state.workExperiences, action.payload);
      })
      .addCase(removeWorkExperience.fulfilled, (state, action) => {
        state.workExperiences = state.workExperiences.filter((w) => w.id !== action.payload);
      });
  },
});

export const { resetProfileError } = profileSlice.actions;
export const profileReducer = profileSlice.reducer;
