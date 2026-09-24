// The widget's visitor/lead list. Separate from ai-widget-slice on purpose: that one owns the
// embed configs, which the list page never touches, and merging them would mean every visitor
// page change re-renders the widget cards and vice versa.

import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { aiWidgetApi } from "../apis";
import type { VisitorCounts, VisitorListParams, WidgetVisitor } from "../apis/types";

export const fetchVisitors = createAsyncThunk("aiWidgetVisitors/fetch", (params: VisitorListParams) =>
  aiWidgetApi.listVisitors(params),
);

type AiWidgetVisitorsState = {
  items: WidgetVisitor[];
  total: number;
  counts: VisitorCounts;
  status: "idle" | "loading" | "failed";
  error: string | null;
};

const initialState: AiWidgetVisitorsState = {
  items: [],
  total: 0,
  counts: { all: 0, visitor: 0, lead: 0 },
  status: "idle",
  error: null,
};

const aiWidgetVisitorsSlice = createSlice({
  name: "aiWidgetVisitors",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchVisitors.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchVisitors.fulfilled, (state, action) => {
        state.status = "idle";
        state.items = action.payload.data;
        state.total = action.payload.total;
        state.counts = action.payload.counts;
      })
      .addCase(fetchVisitors.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load visitors.";
      });
  },
});

export const aiWidgetVisitorsReducer = aiWidgetVisitorsSlice.reducer;
