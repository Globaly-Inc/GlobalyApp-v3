import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { scholarshipsApi } from "../apis";
import type {
  ListScholarshipsParams,
  Scholarship,
  ScholarshipStats,
} from "../apis/types";

export const fetchScholarships = createAsyncThunk(
  "monitoringScholarships/fetch",
  (params: ListScholarshipsParams = { limit: 100 }) => scholarshipsApi.getScholarships(params),
);

export const fetchScholarshipStats = createAsyncThunk("monitoringScholarships/fetchStats", () =>
  scholarshipsApi.getStats(),
);

export const approveScholarship = createAsyncThunk(
  "monitoringScholarships/approve",
  ({ id, publish }: { id: number; publish: boolean }) => scholarshipsApi.approve(id, publish),
);

export const rejectScholarship = createAsyncThunk(
  "monitoringScholarships/reject",
  ({ id, note }: { id: number; note?: string }) => scholarshipsApi.reject(id, note),
);

export const setScholarshipPublished = createAsyncThunk(
  "monitoringScholarships/setPublished",
  ({ id, isPublished }: { id: number; isPublished: boolean }) =>
    scholarshipsApi.setPublished(id, isPublished),
);

export const setScholarshipFeatured = createAsyncThunk(
  "monitoringScholarships/setFeatured",
  ({ id, isFeatured }: { id: number; isFeatured: boolean }) =>
    scholarshipsApi.setFeatured(id, isFeatured),
);

type Status = "idle" | "loading" | "failed";

type ScholarshipsState = {
  scholarships: Scholarship[];
  stats: ScholarshipStats | null;
  status: Status;
  // Per-region, so a failing stats call still leaves the table rendered.
  statsStatus: Status;
  error: string | null;
};

const initialState: ScholarshipsState = {
  scholarships: [],
  stats: null,
  status: "idle",
  statsStatus: "idle",
  error: null,
};

const scholarshipsSlice = createSlice({
  name: "monitoringScholarships",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchScholarships.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchScholarships.fulfilled, (state, action) => {
        state.status = "idle";
        state.scholarships = action.payload;
      })
      .addCase(fetchScholarships.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load scholarships.";
      })
      .addCase(fetchScholarshipStats.pending, (state) => {
        state.statsStatus = "loading";
      })
      .addCase(fetchScholarshipStats.fulfilled, (state, action) => {
        state.statsStatus = "idle";
        state.stats = action.payload;
      })
      .addCase(fetchScholarshipStats.rejected, (state) => {
        state.statsStatus = "failed";
      });

    // Every moderation verb answers with the updated row, so one matcher keeps the
    // table in step without a refetch.
    for (const thunk of [
      approveScholarship,
      rejectScholarship,
      setScholarshipPublished,
      setScholarshipFeatured,
    ]) {
      builder.addCase(thunk.fulfilled, (state, action) => {
        const updated = action.payload;
        state.scholarships = state.scholarships.map((s) => (s.id === updated.id ? updated : s));
      });
      builder.addCase(thunk.rejected, (state, action) => {
        state.error = action.error.message ?? "Moderation action failed.";
      });
    }
  },
});

export const scholarshipsReducer = scholarshipsSlice.reducer;
