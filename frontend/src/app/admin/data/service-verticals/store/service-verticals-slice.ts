import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { serviceVerticalsApi } from "../apis";
import type {
  VerticalReviewStatus,
  VerticalRow,
  VerticalSlug,
  VerticalSummary,
} from "../apis/types";

export const fetchVerticals = createAsyncThunk("dataServiceVerticals/fetchVerticals", () =>
  serviceVerticalsApi.listVerticals(),
);

export const fetchVerticalRows = createAsyncThunk(
  "dataServiceVerticals/fetchRows",
  ({ slug, status }: { slug: VerticalSlug; status?: VerticalReviewStatus }) =>
    serviceVerticalsApi.listRows(slug, status),
);

export const discardVerticalRow = createAsyncThunk(
  "dataServiceVerticals/discard",
  async ({ slug, id }: { slug: VerticalSlug; id: string }) => {
    await serviceVerticalsApi.discardRow(slug, id);
    return id;
  },
);

export const promoteVerticalRow = createAsyncThunk(
  "dataServiceVerticals/promote",
  async ({ slug, id, targetOrgId }: { slug: VerticalSlug; id: string; targetOrgId: number }) => {
    await serviceVerticalsApi.promoteRow(slug, id, targetOrgId);
    return id;
  },
);

type ServiceVerticalsState = {
  verticals: VerticalSummary[];
  activeSlug: VerticalSlug;
  typeColumn: string;
  rows: VerticalRow[];
  status: "idle" | "loading" | "failed";
  error: string | null;
  statusFilter: VerticalReviewStatus | "all";
};

const initialState: ServiceVerticalsState = {
  verticals: [],
  activeSlug: "accommodation",
  typeColumn: "type",
  rows: [],
  status: "idle",
  error: null,
  statusFilter: "pending",
};

const serviceVerticalsSlice = createSlice({
  name: "dataServiceVerticals",
  initialState,
  reducers: {
    setActiveSlug(state, action: PayloadAction<VerticalSlug>) {
      state.activeSlug = action.payload;
      state.rows = [];
    },
    setStatusFilter(state, action: PayloadAction<ServiceVerticalsState["statusFilter"]>) {
      state.statusFilter = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchVerticals.fulfilled, (state, action) => {
        state.verticals = action.payload;
      })
      .addCase(fetchVerticals.rejected, (state, action) => {
        state.error = action.error.message ?? "Failed to load service verticals.";
      })
      .addCase(fetchVerticalRows.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchVerticalRows.fulfilled, (state, action) => {
        state.status = "idle";
        state.rows = action.payload.rows;
        state.typeColumn = action.payload.vertical.type_column;
      })
      .addCase(fetchVerticalRows.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load staged rows.";
      })
      .addCase(discardVerticalRow.fulfilled, (state, action) => {
        state.rows = state.rows.map((r) =>
          r.id === action.payload ? { ...r, status: "discarded" as const } : r,
        );
      })
      .addCase(promoteVerticalRow.fulfilled, (state, action) => {
        state.rows = state.rows.map((r) =>
          r.id === action.payload ? { ...r, status: "promoted" as const } : r,
        );
      });
  },
});

export const { setActiveSlug, setStatusFilter } = serviceVerticalsSlice.actions;
export const serviceVerticalsReducer = serviceVerticalsSlice.reducer;
