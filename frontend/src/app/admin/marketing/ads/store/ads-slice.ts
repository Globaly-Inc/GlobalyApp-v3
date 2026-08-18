import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { adsApi } from "../apis";
import type { AdCampaign, AdReport, AdStats, ListAdsParams } from "../apis/types";

export const fetchAdCampaigns = createAsyncThunk(
  "marketingAds/fetch",
  (params: ListAdsParams = { limit: 100 }) => adsApi.getCampaigns(params),
);

export const fetchAdStats = createAsyncThunk("marketingAds/fetchStats", () => adsApi.getStats());

export const fetchAdReports = createAsyncThunk("marketingAds/fetchReports", () => adsApi.getReports());

export const approveAdCampaign = createAsyncThunk("marketingAds/approve", (id: number) =>
  adsApi.approve(id),
);

export const rejectAdCampaign = createAsyncThunk(
  "marketingAds/reject",
  ({ id, reason }: { id: number; reason: string }) => adsApi.reject(id, reason),
);

export const pauseAdCampaign = createAsyncThunk("marketingAds/pause", (id: number) => adsApi.pause(id));

type Status = "idle" | "loading" | "failed";

type AdsState = {
  campaigns: AdCampaign[];
  stats: AdStats | null;
  reports: AdReport[];
  status: Status;
  // Per-region, so a failing stats or reports call still leaves the table rendered.
  statsStatus: Status;
  reportsStatus: Status;
  error: string | null;
};

const initialState: AdsState = {
  campaigns: [],
  stats: null,
  reports: [],
  status: "idle",
  statsStatus: "idle",
  reportsStatus: "idle",
  error: null,
};

const adsSlice = createSlice({
  name: "marketingAds",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchAdCampaigns.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchAdCampaigns.fulfilled, (state, action) => {
        state.status = "idle";
        state.campaigns = action.payload;
      })
      .addCase(fetchAdCampaigns.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load ad campaigns.";
      })
      .addCase(fetchAdStats.pending, (state) => {
        state.statsStatus = "loading";
      })
      .addCase(fetchAdStats.fulfilled, (state, action) => {
        state.statsStatus = "idle";
        state.stats = action.payload;
      })
      .addCase(fetchAdStats.rejected, (state) => {
        state.statsStatus = "failed";
      })
      .addCase(fetchAdReports.pending, (state) => {
        state.reportsStatus = "loading";
      })
      .addCase(fetchAdReports.fulfilled, (state, action) => {
        state.reportsStatus = "idle";
        state.reports = action.payload;
      })
      .addCase(fetchAdReports.rejected, (state) => {
        state.reportsStatus = "failed";
      });

    // Every moderation verb answers with the updated campaign, so one matcher keeps
    // the table in step without a refetch.
    for (const thunk of [approveAdCampaign, rejectAdCampaign, pauseAdCampaign]) {
      builder.addCase(thunk.fulfilled, (state, action) => {
        const updated = action.payload;
        state.campaigns = state.campaigns.map((c) =>
          // business_name is not in the moderation response (it comes from a join
          // on the list query), so it is carried over rather than dropped to null.
          c.id === updated.id ? { ...updated, business_name: c.business_name } : c,
        );
      });
      builder.addCase(thunk.rejected, (state, action) => {
        state.error = action.error.message ?? "Moderation action failed.";
      });
    }
  },
});

export const adsReducer = adsSlice.reducer;
