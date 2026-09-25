// The Inbox's AI Conversations tab: widget visitors as conversations, plus each one's transcript.
//
// Its own slice rather than a reuse of ai-widget's `aiWidgetVisitors`: that one belongs to the
// paged, filtered Visitors table, and an Inbox fetch landing in it would reset whatever page the
// owner had open there. The endpoints are the same ones — only the state is separate.

import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { aiWidgetApi } from "@/app/business/ai-widget/apis";
import type { VisitorMessage, WidgetVisitor } from "@/app/business/ai-widget/apis/types";

/** ponytail: the newest 100 (the API's max page) — add paging when an Inbox outgrows it. */
export const fetchEmbedChats = createAsyncThunk("embedChats/fetch", () =>
  aiWidgetApi.listVisitors({ page: 1, limit: 100 }),
);

export const fetchEmbedTranscript = createAsyncThunk("embedChats/transcript", (visitorId: number) =>
  aiWidgetApi.listVisitorMessages(visitorId),
);

type EmbedChatsState = {
  visitors: WidgetVisitor[];
  /** All of this org's visitors — may exceed `visitors`, which is capped at one page. */
  total: number;
  status: "idle" | "loading" | "failed";
  /** Keyed by visitor id. */
  transcripts: Record<number, VisitorMessage[]>;
  transcriptStatus: Record<number, "idle" | "loading" | "failed">;
};

const initialState: EmbedChatsState = { visitors: [], total: 0, status: "idle", transcripts: {}, transcriptStatus: {} };

const embedChatsSlice = createSlice({
  name: "embedChats",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchEmbedChats.pending, (state) => {
        state.status = "loading";
      })
      .addCase(fetchEmbedChats.fulfilled, (state, action) => {
        state.status = "idle";
        state.visitors = action.payload.data;
        state.total = action.payload.total;
      })
      .addCase(fetchEmbedChats.rejected, (state) => {
        state.status = "failed";
      })
      .addCase(fetchEmbedTranscript.pending, (state, action) => {
        state.transcriptStatus[action.meta.arg] = "loading";
      })
      .addCase(fetchEmbedTranscript.fulfilled, (state, action) => {
        state.transcriptStatus[action.meta.arg] = "idle";
        state.transcripts[action.meta.arg] = action.payload;
      })
      .addCase(fetchEmbedTranscript.rejected, (state, action) => {
        state.transcriptStatus[action.meta.arg] = "failed";
      });
  },
});

export const embedChatsReducer = embedChatsSlice.reducer;
