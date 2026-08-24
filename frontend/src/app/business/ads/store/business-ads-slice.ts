import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { businessAdsApi } from "../apis";
import type { Campaign, CreateCampaignInput } from "../apis/types";

export const fetchCampaigns = createAsyncThunk("businessAds/fetchAll", () => businessAdsApi.listCampaigns());

export const createCampaign = createAsyncThunk(
  "businessAds/create",
  async (input: CreateCampaignInput, { rejectWithValue }) => {
    try {
      return await businessAdsApi.createCampaign(input);
    } catch (err) {
      return rejectWithValue(err instanceof Error ? err.message : "Failed to create campaign");
    }
  },
);

export const setCampaignStatus = createAsyncThunk(
  "businessAds/setStatus",
  ({ campaignId, status }: { campaignId: number; status: Campaign["status"] }) =>
    businessAdsApi.updateCampaign(campaignId, { status }),
);

export const deleteCampaign = createAsyncThunk("businessAds/delete", async (campaignId: number) => {
  await businessAdsApi.deleteCampaign(campaignId);
  return campaignId;
});

type BusinessAdsState = {
  items: Campaign[];
  status: "idle" | "loading" | "failed";
  error: string | null;
  creating: boolean;
  createError: string | null;
};

const initialState: BusinessAdsState = {
  items: [],
  status: "idle",
  error: null,
  creating: false,
  createError: null,
};

const businessAdsSlice = createSlice({
  name: "businessAds",
  initialState,
  reducers: {
    clearCreateError: (state) => {
      state.createError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchCampaigns.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchCampaigns.fulfilled, (state, action) => {
        state.status = "idle";
        state.items = action.payload;
      })
      .addCase(fetchCampaigns.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load ad campaigns";
      })

      .addCase(createCampaign.pending, (state) => {
        state.creating = true;
        state.createError = null;
      })
      .addCase(createCampaign.fulfilled, (state, action) => {
        state.creating = false;
        state.items = [action.payload, ...state.items];
      })
      .addCase(createCampaign.rejected, (state, action) => {
        state.creating = false;
        state.createError = (action.payload as string) ?? "Failed to create campaign";
      })

      .addCase(setCampaignStatus.fulfilled, (state, action) => {
        state.items = state.items.map((c) => (c.id === action.payload.id ? action.payload : c));
      })

      .addCase(deleteCampaign.fulfilled, (state, action) => {
        state.items = state.items.filter((c) => c.id !== action.payload);
      });
  },
});

export const { clearCreateError } = businessAdsSlice.actions;
export const businessAdsReducer = businessAdsSlice.reducer;
