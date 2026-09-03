import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { subscribersApi } from "../apis";
import type { Subscriber, SubscribersResponse } from "../apis/types";

export const fetchSubscribers = createAsyncThunk(
  "marketingSubscribers/fetchSubscribers",
  async ({ page = 1, limit = 20, type, search }: { page?: number; limit?: number; type?: string; search?: string }) =>
    await subscribersApi.list(page, limit, type, search),
);

export const exportSubscribers = createAsyncThunk(
  "marketingSubscribers/exportSubscribers",
  async ({ type, search }: { type?: string; search?: string }): Promise<void> => {
    const blob = await subscribersApi.export(type, search);
    const url = window.URL.createObjectURL(blob as Blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `subscribers-${Date.now()}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  },
);

type SubscribersState = {
  subscribers: Subscriber[];
  page: number;
  limit: number;
  total: number;
  status: "idle" | "loading" | "failed";
  error: string | null;
};

const initialState: SubscribersState = {
  subscribers: [],
  page: 1,
  limit: 20,
  total: 0,
  status: "idle",
  error: null,
};

const subscribersSlice = createSlice({
  name: "marketingSubscribers",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchSubscribers.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchSubscribers.fulfilled, (state, action) => {
        state.status = "idle";
        state.subscribers = action.payload.data;
        state.page = action.payload.meta.page;
        state.limit = action.payload.meta.limit;
        state.total = action.payload.meta.total;
      })
      .addCase(fetchSubscribers.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load subscribers.";
      })
      .addCase(exportSubscribers.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to export subscribers.";
      });
  },
});

export const subscribersReducer = subscribersSlice.reducer;
