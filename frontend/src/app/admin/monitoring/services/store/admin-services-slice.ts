import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { adminServicesApi } from "../apis";
import type { AdminServiceListing, AdminServiceOrder, AdminServicesStats } from "../apis";

export const fetchServicesStats = createAsyncThunk("adminServices/stats", () => adminServicesApi.getStats());

export const fetchServiceListings = createAsyncThunk(
  "adminServices/listings",
  (params: { search?: string; status?: string; page?: number } = {}) => adminServicesApi.getListings(params),
);

export const fetchServiceOrders = createAsyncThunk(
  "adminServices/orders",
  (params: { status?: string; page?: number } = {}) => adminServicesApi.getOrders(params),
);

type Status = "idle" | "loading" | "failed";

interface State {
  stats: AdminServicesStats | null;
  listings: AdminServiceListing[];
  orders: AdminServiceOrder[];
  listingsTotal: number;
  ordersTotal: number;
  // Per region, so a failure in one table leaves the other rendered.
  statsStatus: Status;
  listingsStatus: Status;
  ordersStatus: Status;
  error: string | null;
}

const initialState: State = {
  stats: null,
  listings: [],
  orders: [],
  listingsTotal: 0,
  ordersTotal: 0,
  statsStatus: "idle",
  listingsStatus: "idle",
  ordersStatus: "idle",
  error: null,
};

const slice = createSlice({
  name: "adminServices",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchServicesStats.pending, (state) => {
        state.statsStatus = "loading";
      })
      .addCase(fetchServicesStats.fulfilled, (state, action) => {
        state.statsStatus = "idle";
        state.stats = action.payload;
      })
      .addCase(fetchServicesStats.rejected, (state, action) => {
        state.statsStatus = "failed";
        state.error = action.error.message ?? "Could not load service stats.";
      })

      .addCase(fetchServiceListings.pending, (state) => {
        state.listingsStatus = "loading";
      })
      .addCase(fetchServiceListings.fulfilled, (state, action) => {
        state.listingsStatus = "idle";
        state.listings = action.payload.data;
        state.listingsTotal = action.payload.meta.total;
      })
      .addCase(fetchServiceListings.rejected, (state, action) => {
        state.listingsStatus = "failed";
        state.error = action.error.message ?? "Could not load listings.";
      })

      .addCase(fetchServiceOrders.pending, (state) => {
        state.ordersStatus = "loading";
      })
      .addCase(fetchServiceOrders.fulfilled, (state, action) => {
        state.ordersStatus = "idle";
        state.orders = action.payload.data;
        state.ordersTotal = action.payload.meta.total;
      })
      .addCase(fetchServiceOrders.rejected, (state, action) => {
        state.ordersStatus = "failed";
        state.error = action.error.message ?? "Could not load orders.";
      });
  },
});

export const adminServicesReducer = slice.reducer;
