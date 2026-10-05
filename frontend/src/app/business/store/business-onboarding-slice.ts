import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { businessApi } from "../apis";
import type {
  BusinessProfile, BusinessProfilePatch, BusinessRegisterInput, InstitutionRegisterInput, StartExtractionInput,
  OnboardingProgress, ExtractionStatus,
} from "../apis/types";
import { EXTRACTION_TERMINAL_STATUSES } from "../portal/const";

// Result isn't stored in this slice's state — a successful registration hard-navigates
// to /business (same reload rationale the business switcher already uses), so there's
// no stale profile/org state left behind to reconcile.
export const registerBusiness = createAsyncThunk(
  "businessOnboarding/registerBusiness",
  (input: BusinessRegisterInput) => businessApi.registerBusiness(input),
);

export const registerInstitution = createAsyncThunk(
  "businessOnboarding/registerInstitution",
  (input: InstitutionRegisterInput) => businessApi.registerInstitution(input),
);

export const fetchMyProfile = createAsyncThunk("businessOnboarding/fetchMyProfile", () =>
  businessApi.getMyProfile(),
);

export const updateMyProfile = createAsyncThunk(
  "businessOnboarding/updateMyProfile",
  (patch: BusinessProfilePatch) => businessApi.updateMyProfile(patch),
);

// Not routed through the shared "saving" status: the empty-state card tracks its own
// submitting/error state locally, since a start-extraction failure (e.g. already started,
// missing website) is specific to that card, not the profile-wide save banner.
export const startExtraction = createAsyncThunk(
  "businessOnboarding/startExtraction",
  (input: StartExtractionInput) => businessApi.startExtraction(input),
);

export const fetchExtractionStatus = createAsyncThunk("businessOnboarding/fetchExtractionStatus", () =>
  businessApi.getExtractionStatus(),
);

export const fetchOnboardingProgress = createAsyncThunk("businessOnboarding/fetchOnboardingProgress", () =>
  businessApi.getOnboardingProgress(),
);

/** The welcome splash has played. Fire-and-forget from the splash's own dismiss: a failed write
 *  only costs seeing it once more on a later visit, which is not worth blocking an animation on. */
export const markWelcomeSeen = createAsyncThunk("businessOnboarding/markWelcomeSeen", () =>
  businessApi.markWelcomeSeen(),
);

type BusinessOnboardingState = {
  profile: BusinessProfile | null;
  onboardingProgress: OnboardingProgress | null;
  /** undefined = not fetched yet; null = no extraction job. */
  extractionStatus?: ExtractionStatus;
  status: "idle" | "loading" | "saving" | "failed";
  error: string | null;
};

const initialState: BusinessOnboardingState = { profile: null, onboardingProgress: null, status: "idle", error: null };

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
        // Another org's profile (a switch): its extraction status is someone else's — drop it so the
        // lock re-checks this org instead of showing (or skipping) the previous one's crawl.
        if (state.profile?.schema_name !== action.payload.schema_name) state.extractionStatus = undefined;
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
      .addCase(startExtraction.fulfilled, (state, action) => {
        state.profile = action.payload;
        state.extractionStatus = undefined;
      })
      .addCase(fetchExtractionStatus.fulfilled, (state, action) => {
        state.extractionStatus = action.payload;
      })
      // A failed status call must not lock the portal — treat it as "no extraction".
      .addCase(fetchExtractionStatus.rejected, (state) => {
        if (state.extractionStatus === undefined) state.extractionStatus = null;
      })
      .addCase(fetchOnboardingProgress.fulfilled, (state, action) => {
        state.onboardingProgress = action.payload;
      })
      // Locally too, not just on the server: the portal fetches progress once per mount, so without
      // this a remount inside the same session would replay the splash from stale state.
      .addCase(markWelcomeSeen.fulfilled, (state) => {
        if (state.onboardingProgress) state.onboardingProgress.showWelcome = false;
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
      })
      .addCase(registerInstitution.pending, (state) => {
        state.status = "saving";
        state.error = null;
      })
      .addCase(registerInstitution.fulfilled, (state) => {
        state.status = "idle";
      })
      .addCase(registerInstitution.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to create institution.";
      });
  },
});

/** The profile's own (or head office's) crawl is still running — the portal stays locked until it ends.
 *  Not fetched yet counts as running, so the full nav doesn't flash before the first answer. */
export function isExtractionRunning(profile: BusinessProfile | null, status: ExtractionStatus | undefined): boolean {
  if (!profile || !(profile.source_job_id || profile.extraction_parent_name)) return false;
  if (status === undefined) return true;
  return !!status && !EXTRACTION_TERMINAL_STATUSES.has(status.status);
}

export const { resetBusinessOnboardingError } = businessOnboardingSlice.actions;
export const businessOnboardingReducer = businessOnboardingSlice.reducer;
