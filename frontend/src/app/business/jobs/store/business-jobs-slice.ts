import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { businessJobsApi } from "../apis";
import type { Application, ApplicationStatus, CreateJobInput, Job } from "../apis/types";

export const fetchJobs = createAsyncThunk("businessJobs/fetchAll", () => businessJobsApi.listJobs());

export const createJob = createAsyncThunk(
  "businessJobs/create",
  async (input: CreateJobInput, { rejectWithValue }) => {
    try {
      return await businessJobsApi.createJob(input);
    } catch (err) {
      return rejectWithValue(err instanceof Error ? err.message : "Failed to create job posting");
    }
  },
);

export const togglePublished = createAsyncThunk(
  "businessJobs/togglePublished",
  ({ jobId, is_published }: { jobId: number; is_published: boolean }) =>
    businessJobsApi.updateJob(jobId, { is_published }),
);

export const deleteJob = createAsyncThunk("businessJobs/delete", async (jobId: number) => {
  await businessJobsApi.deleteJob(jobId);
  return jobId;
});

export const fetchApplications = createAsyncThunk("businessJobs/fetchApplications", (jobId: number) =>
  businessJobsApi.listApplications(jobId).then((applications) => ({ jobId, applications })),
);

export const reviewApplication = createAsyncThunk(
  "businessJobs/reviewApplication",
  async ({ jobId, applicationId, status }: { jobId: number; applicationId: number; status: ApplicationStatus }) => {
    const application = await businessJobsApi.reviewApplication(jobId, applicationId, status);
    return { jobId, application };
  },
);

type BusinessJobsState = {
  items: Job[];
  status: "idle" | "loading" | "failed";
  error: string | null;
  creating: boolean;
  createError: string | null;
  applicationsByJob: Record<number, Application[]>;
  applicationsLoading: number | null;
};

const initialState: BusinessJobsState = {
  items: [],
  status: "idle",
  error: null,
  creating: false,
  createError: null,
  applicationsByJob: {},
  applicationsLoading: null,
};

const businessJobsSlice = createSlice({
  name: "businessJobs",
  initialState,
  reducers: {
    clearCreateError: (state) => {
      state.createError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchJobs.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchJobs.fulfilled, (state, action) => {
        state.status = "idle";
        state.items = action.payload;
      })
      .addCase(fetchJobs.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load job postings";
      })

      .addCase(createJob.pending, (state) => {
        state.creating = true;
        state.createError = null;
      })
      .addCase(createJob.fulfilled, (state, action) => {
        state.creating = false;
        state.items = [action.payload, ...state.items];
      })
      .addCase(createJob.rejected, (state, action) => {
        state.creating = false;
        state.createError = (action.payload as string) ?? "Failed to create job posting";
      })

      .addCase(togglePublished.fulfilled, (state, action) => {
        state.items = state.items.map((j) => (j.id === action.payload.id ? action.payload : j));
      })

      .addCase(deleteJob.fulfilled, (state, action) => {
        state.items = state.items.filter((j) => j.id !== action.payload);
      })

      .addCase(fetchApplications.pending, (state, action) => {
        state.applicationsLoading = action.meta.arg;
      })
      .addCase(fetchApplications.fulfilled, (state, action) => {
        state.applicationsLoading = null;
        state.applicationsByJob[action.payload.jobId] = action.payload.applications;
      })
      .addCase(fetchApplications.rejected, (state) => {
        state.applicationsLoading = null;
      })

      .addCase(reviewApplication.fulfilled, (state, action) => {
        const list = state.applicationsByJob[action.payload.jobId] ?? [];
        state.applicationsByJob[action.payload.jobId] = list.map((a) =>
          a.id === action.payload.application.id ? action.payload.application : a,
        );
      });
  },
});

export const { clearCreateError } = businessJobsSlice.actions;
export const businessJobsReducer = businessJobsSlice.reducer;
