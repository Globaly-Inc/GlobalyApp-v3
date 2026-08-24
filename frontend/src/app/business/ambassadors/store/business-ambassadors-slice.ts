import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { businessAmbassadorsApi } from "../apis";
import type { Application, CreateProgramInput, Program } from "../apis/types";

export const fetchPrograms = createAsyncThunk("businessAmbassadors/fetchPrograms", () =>
  businessAmbassadorsApi.listPrograms(),
);

export const createProgram = createAsyncThunk(
  "businessAmbassadors/createProgram",
  async (input: CreateProgramInput, { rejectWithValue }) => {
    try {
      return await businessAmbassadorsApi.createProgram(input);
    } catch (err) {
      return rejectWithValue(err instanceof Error ? err.message : "Failed to create program");
    }
  },
);

export const setProgramStatus = createAsyncThunk(
  "businessAmbassadors/setProgramStatus",
  async ({ programId, status }: { programId: number; status: Program["status"] }, { rejectWithValue }) => {
    try {
      return await businessAmbassadorsApi.updateProgram(programId, { status });
    } catch (err) {
      return rejectWithValue(err instanceof Error ? err.message : "Failed to update program");
    }
  },
);

export const fetchApplications = createAsyncThunk("businessAmbassadors/fetchApplications", (programId: number) =>
  businessAmbassadorsApi.listApplications(programId).then((applications) => ({ programId, applications })),
);

export const reviewApplication = createAsyncThunk(
  "businessAmbassadors/reviewApplication",
  async (
    { programId, applicationId, decision }: { programId: number; applicationId: number; decision: "approved" | "rejected" },
    { rejectWithValue },
  ) => {
    try {
      const result = await businessAmbassadorsApi.reviewApplication(programId, applicationId, decision);
      return { programId, ...result };
    } catch (err) {
      return rejectWithValue(err instanceof Error ? err.message : "Failed to review application");
    }
  },
);

type BusinessAmbassadorsState = {
  programs: Program[];
  status: "idle" | "loading" | "failed";
  error: string | null;
  createError: string | null;
  creating: boolean;
  /** Applications keyed by program_id — fetched lazily when a program's panel opens. */
  applicationsByProgram: Record<number, Application[]>;
  applicationsLoading: number | null;
  reviewingId: number | null;
  reviewError: string | null;
};

const initialState: BusinessAmbassadorsState = {
  programs: [],
  status: "idle",
  error: null,
  createError: null,
  creating: false,
  applicationsByProgram: {},
  applicationsLoading: null,
  reviewingId: null,
  reviewError: null,
};

const businessAmbassadorsSlice = createSlice({
  name: "businessAmbassadors",
  initialState,
  reducers: {
    clearCreateError: (state) => {
      state.createError = null;
    },
    clearReviewError: (state) => {
      state.reviewError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchPrograms.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchPrograms.fulfilled, (state, action) => {
        state.status = "idle";
        state.programs = action.payload;
      })
      .addCase(fetchPrograms.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load ambassador programs";
      })

      .addCase(createProgram.pending, (state) => {
        state.creating = true;
        state.createError = null;
      })
      .addCase(createProgram.fulfilled, (state, action) => {
        state.creating = false;
        state.programs = [action.payload, ...state.programs];
      })
      .addCase(createProgram.rejected, (state, action) => {
        state.creating = false;
        state.createError = (action.payload as string) ?? "Failed to create program";
      })

      .addCase(setProgramStatus.fulfilled, (state, action) => {
        state.programs = state.programs.map((p) => (p.id === action.payload.id ? action.payload : p));
      })

      .addCase(fetchApplications.pending, (state, action) => {
        state.applicationsLoading = action.meta.arg;
      })
      .addCase(fetchApplications.fulfilled, (state, action) => {
        state.applicationsLoading = null;
        state.applicationsByProgram[action.payload.programId] = action.payload.applications;
      })
      .addCase(fetchApplications.rejected, (state) => {
        state.applicationsLoading = null;
      })

      .addCase(reviewApplication.pending, (state, action) => {
        state.reviewingId = action.meta.arg.applicationId;
        state.reviewError = null;
      })
      .addCase(reviewApplication.fulfilled, (state, action) => {
        state.reviewingId = null;
        const list = state.applicationsByProgram[action.payload.programId] ?? [];
        state.applicationsByProgram[action.payload.programId] = list.map((a) =>
          a.id === action.payload.application.id ? action.payload.application : a,
        );
      })
      .addCase(reviewApplication.rejected, (state, action) => {
        state.reviewingId = null;
        state.reviewError = (action.payload as string) ?? "Failed to review application";
      });
  },
});

export const { clearCreateError, clearReviewError } = businessAmbassadorsSlice.actions;
export const businessAmbassadorsReducer = businessAmbassadorsSlice.reducer;
