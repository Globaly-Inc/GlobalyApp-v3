// How visitors become leads — aggregates over institution_conversation_signals.
//
// Its own slice beside the other three for the same reason they are separate: this is a
// read-only panel and a fetch here must not disturb a filter or an unsaved draft elsewhere.

import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { aiKnowledgeApi } from "../apis";
import type { ConversionInsights } from "../apis/types";

export const fetchConversionInsights = createAsyncThunk("aiKnowledgeInsights/fetch", () =>
  aiKnowledgeApi.getConversionInsights(),
);

type State = {
  insights: ConversionInsights | null;
  status: "idle" | "loading" | "failed";
  error: string | null;
};

const initialState: State = { insights: null, status: "idle", error: null };

const slice = createSlice({
  name: "aiKnowledgeInsights",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchConversionInsights.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchConversionInsights.fulfilled, (state, action) => {
        state.status = "idle";
        state.insights = action.payload;
      })
      .addCase(fetchConversionInsights.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Couldn't load conversion insights.";
      });
  },
});

export const aiKnowledgeInsightsReducer = slice.reducer;
