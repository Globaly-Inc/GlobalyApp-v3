import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { homeApi } from "../apis";
import type { RecentEnquiry } from "../apis/types";

/**
 * The personal portal's rail. The feed itself lives in the shared portal slice (`@/app/portal/store/
 * feed-slice`) because both portals render the same timeline — only this rail is personal-specific.
 */
export const fetchRecentEnquiries = createAsyncThunk("home/fetchRecentEnquiries", () =>
  homeApi.listRecentEnquiries(),
);

type HomeState = {
  enquiries: RecentEnquiry[];
  /** The TRUE total from meta.total — the tile must not show the length of the five-row preview. */
  enquiriesTotal: number;
  enquiriesStatus: "idle" | "loading" | "failed";
};

const initialState: HomeState = { enquiries: [], enquiriesTotal: 0, enquiriesStatus: "idle" };

const homeSlice = createSlice({
  name: "home",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchRecentEnquiries.pending, (state) => {
        state.enquiriesStatus = "loading";
      })
      .addCase(fetchRecentEnquiries.fulfilled, (state, action) => {
        state.enquiriesStatus = "idle";
        state.enquiries = action.payload.items;
        state.enquiriesTotal = action.payload.total;
      })
      .addCase(fetchRecentEnquiries.rejected, (state) => {
        // A failed rail fetch leaves the card empty rather than erroring the page — the feed is the point.
        state.enquiriesStatus = "failed";
      });
  },
});

export const homeReducer = homeSlice.reducer;
