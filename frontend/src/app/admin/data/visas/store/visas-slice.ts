import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { visasApi } from "../apis";
import type { VisaExtraction, VisaExtractionStatus } from "../apis/types";

export const fetchVisas = createAsyncThunk(
  "dataVisas/fetch",
  (status?: VisaExtractionStatus) => visasApi.listVisas(status),
);

export const discardVisa = createAsyncThunk("dataVisas/discard", async (id: string) => {
  await visasApi.discardVisa(id);
  return id;
});

export const promoteVisa = createAsyncThunk(
  "dataVisas/promote",
  async ({ id, departmentOrgId }: { id: string; departmentOrgId: number }) => {
    await visasApi.promoteVisa(id, departmentOrgId);
    return id;
  },
);

export const launchVisaExtraction = createAsyncThunk("dataVisas/launch", (urls: string[]) =>
  visasApi.launchExtraction(urls),
);

type VisasState = {
  visas: VisaExtraction[];
  status: "idle" | "loading" | "failed";
  error: string | null;
  statusFilter: VisaExtractionStatus | "all";
};

const initialState: VisasState = { visas: [], status: "idle", error: null, statusFilter: "pending" };

const visasSlice = createSlice({
  name: "dataVisas",
  initialState,
  reducers: {
    setStatusFilter(state, action: PayloadAction<VisasState["statusFilter"]>) {
      state.statusFilter = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchVisas.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchVisas.fulfilled, (state, action) => {
        state.status = "idle";
        state.visas = action.payload;
      })
      .addCase(fetchVisas.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load visas.";
      })
      .addCase(discardVisa.fulfilled, (state, action) => {
        state.visas = state.visas.map((v) =>
          v.id === action.payload ? { ...v, status: "discarded" as const } : v,
        );
      })
      .addCase(promoteVisa.fulfilled, (state, action) => {
        state.visas = state.visas.map((v) =>
          v.id === action.payload ? { ...v, status: "promoted" as const } : v,
        );
      });
  },
});

export const { setStatusFilter } = visasSlice.actions;
export const visasReducer = visasSlice.reducer;
