import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { businessEnquiriesApi } from "@/app/business/enquiries/apis";
import { businessProfileDetailApi } from "@/app/business/profile/apis";
import type { DistributionListItem } from "@/app/business/enquiries/apis/types";

/** The rail shows five; the tile shows the true total, so the list length is never used as the count. */
const RAIL_ROWS = 5;

/**
 * The business portal's rail. No new endpoints: credits, the enquiry inbox and the service catalogue
 * already have feature APIs, and this reads them together in one round of requests.
 *
 * Deliberately tolerant — a rail card that fails leaves its own value null and the rest of the page
 * renders. The feed is the point of this screen.
 */
export const fetchBusinessHome = createAsyncThunk("businessHome/fetch", async () => {
  const [credits, distributions, services] = await Promise.all([
    businessEnquiriesApi.getCredits().catch(() => null),
    businessEnquiriesApi.listDistributions().catch(() => null),
    businessProfileDetailApi.searchServices({ page: 1, limit: 1 }).catch(() => null),
  ]);
  const items = distributions?.data ?? [];
  return {
    credits: credits?.balance ?? null,
    // ponytail: listDistributions returns up to 100 rows and no meta.total, so this count saturates at
    // 100. Add a count endpoint (or meta.total) if a business ever legitimately passes that.
    enquiriesTotal: items.length,
    enquiries: [...items]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, RAIL_ROWS),
    servicesTotal: services?.total ?? null,
  };
});

type BusinessHomeState = {
  /** null = not loaded or the call failed; the tile shows a dash rather than a wrong zero. */
  credits: number | null;
  enquiries: DistributionListItem[];
  enquiriesTotal: number | null;
  servicesTotal: number | null;
  status: "idle" | "loading" | "failed";
};

const initialState: BusinessHomeState = {
  credits: null,
  enquiries: [],
  enquiriesTotal: null,
  servicesTotal: null,
  status: "idle",
};

const businessHomeSlice = createSlice({
  name: "businessHome",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchBusinessHome.pending, (state) => {
        state.status = "loading";
      })
      .addCase(fetchBusinessHome.fulfilled, (state, action) => {
        state.status = "idle";
        state.credits = action.payload.credits;
        state.enquiries = action.payload.enquiries;
        state.enquiriesTotal = action.payload.enquiriesTotal;
        state.servicesTotal = action.payload.servicesTotal;
      })
      .addCase(fetchBusinessHome.rejected, (state) => {
        state.status = "failed";
      });
  },
});

export const businessHomeReducer = businessHomeSlice.reducer;
