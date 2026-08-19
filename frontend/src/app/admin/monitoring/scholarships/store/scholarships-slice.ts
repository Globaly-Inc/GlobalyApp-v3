import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { scholarshipsApi } from "../apis";
import type { ScholarshipListParams } from "../apis/real-api";
import type { Scholarship, ScholarshipInput } from "../apis/types";

const DEFAULT_LIMIT = 10;

export const fetchScholarships = createAsyncThunk(
  "monitoringScholarships/fetch",
  (params: ScholarshipListParams, { getState }) => {
    const state = (getState() as { monitoringScholarships: ScholarshipsState }).monitoringScholarships;
    return scholarshipsApi.getScholarships({ page: state.page, limit: state.limit, ...state.filters, ...params });
  },
);

/** One cheap limit=1 request per status just to read `meta.total` for the stat cards — there's no dedicated counts endpoint. */
export const fetchScholarshipCounts = createAsyncThunk("monitoringScholarships/fetchCounts", async () => {
  const [total, published, draft, featured] = await Promise.all([
    scholarshipsApi.getScholarships({ limit: 1 }),
    scholarshipsApi.getScholarships({ limit: 1, is_published: true }),
    scholarshipsApi.getScholarships({ limit: 1, is_published: false }),
    scholarshipsApi.getScholarships({ limit: 1, is_featured: true }),
  ]);
  return {
    total: total.meta.total, published: published.meta.total,
    draft: draft.meta.total, featured: featured.meta.total,
  };
});

export const createScholarship = createAsyncThunk(
  "monitoringScholarships/create",
  async (input: ScholarshipInput, { dispatch }) => {
    await scholarshipsApi.createScholarship(input);
    await Promise.all([dispatch(fetchScholarships({})), dispatch(fetchScholarshipCounts())]);
  },
);

export const updateScholarship = createAsyncThunk(
  "monitoringScholarships/update",
  async ({ id, input }: { id: number; input: Partial<ScholarshipInput> }, { dispatch }) => {
    await scholarshipsApi.updateScholarship(id, input);
    await Promise.all([dispatch(fetchScholarships({})), dispatch(fetchScholarshipCounts())]);
  },
);

export const removeScholarship = createAsyncThunk(
  "monitoringScholarships/remove",
  async (id: number, { dispatch }) => {
    await scholarshipsApi.deleteScholarship(id);
    await Promise.all([dispatch(fetchScholarships({})), dispatch(fetchScholarshipCounts())]);
  },
);

export const removeScholarships = createAsyncThunk(
  "monitoringScholarships/removeMany",
  async (ids: number[], { dispatch }) => {
    await Promise.all(ids.map((id) => scholarshipsApi.deleteScholarship(id)));
    await Promise.all([dispatch(fetchScholarships({})), dispatch(fetchScholarshipCounts())]);
  },
);

type Filters = Omit<ScholarshipListParams, "page" | "limit">;

type ScholarshipsState = {
  scholarships: Scholarship[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  filters: Filters;
  counts: { total: number; published: number; draft: number; featured: number };
  status: "idle" | "loading" | "failed";
  error: string | null;
};

const initialState: ScholarshipsState = {
  scholarships: [], page: 1, limit: DEFAULT_LIMIT, total: 0, totalPages: 1,
  filters: {}, counts: { total: 0, published: 0, draft: 0, featured: 0 },
  status: "idle", error: null,
};

const scholarshipsSlice = createSlice({
  name: "monitoringScholarships",
  initialState,
  reducers: {
    setPage(state, action: { payload: number }) {
      state.page = action.payload;
    },
    setFilters(state, action: { payload: Filters }) {
      state.filters = action.payload;
      state.page = 1;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchScholarships.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchScholarships.fulfilled, (state, action) => {
        state.status = "idle";
        state.scholarships = action.payload.data;
        state.page = action.payload.meta.page;
        state.limit = action.payload.meta.limit;
        state.total = action.payload.meta.total;
        state.totalPages = action.payload.meta.totalPages;
      })
      .addCase(fetchScholarships.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load scholarships.";
      })
      .addCase(fetchScholarshipCounts.fulfilled, (state, action) => {
        state.counts = action.payload;
      });
  },
});

export const { setPage, setFilters } = scholarshipsSlice.actions;
export const scholarshipsReducer = scholarshipsSlice.reducer;
