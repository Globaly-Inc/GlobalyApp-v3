// The review queue: widget conversations on this institution's widgets, and the thread behind
// each one.
//
// Its own slice rather than a reuse of `embedChats` (business/messages): that one lists
// conversations by VISITOR for the Inbox and carries no review columns. These endpoints are
// keyed by session and return review_status / correction / memory_ids, which is the whole
// reason this screen exists.

import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { aiKnowledgeApi } from "../apis";
import type { ReviewInput, ReviewMessage, ReviewSession } from "../apis/types";
import { CONVERSATION_PAGE_SIZE } from "../const";

export const fetchConversations = createAsyncThunk(
  "aiKnowledgeReviews/fetch",
  (params: { unreviewed?: boolean }) =>
    aiKnowledgeApi.listConversations({ ...params, limit: CONVERSATION_PAGE_SIZE }),
);

export const fetchThread = createAsyncThunk("aiKnowledgeReviews/thread", (sessionId: number) =>
  aiKnowledgeApi.listConversationMessages(sessionId),
);

/**
 * Submit a review and re-read the thread.
 *
 * Re-read rather than patch locally on purpose: the backend also stamps `reviewed_by` and
 * `reviewed_at`, and a correction publishes a learning job. Showing the server's own row is
 * what makes "this really was recorded" true rather than optimistic.
 */
export const reviewMessage = createAsyncThunk(
  "aiKnowledgeReviews/review",
  async ({ sessionId, messageId, review }: { sessionId: number; messageId: number; review: ReviewInput }) => {
    await aiKnowledgeApi.reviewMessage(messageId, review);
    return { sessionId, messages: await aiKnowledgeApi.listConversationMessages(sessionId) };
  },
);

type AiKnowledgeReviewsState = {
  sessions: ReviewSession[];
  status: "idle" | "loading" | "failed";
  error: string | null;
  requestId: string | null;
  /** Keyed by session id. Session ids are tenant-local, so this is wiped on account switch. */
  threads: Record<number, ReviewMessage[]>;
  threadStatus: Record<number, "idle" | "loading" | "failed">;
  reviewStatus: "idle" | "loading" | "failed";
};

const initialState: AiKnowledgeReviewsState = {
  sessions: [],
  status: "idle",
  error: null,
  requestId: null,
  threads: {},
  threadStatus: {},
  reviewStatus: "idle",
};

const aiKnowledgeReviewsSlice = createSlice({
  name: "aiKnowledgeReviews",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchConversations.pending, (state, action) => {
        state.requestId = action.meta.requestId;
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchConversations.fulfilled, (state, action) => {
        if (action.meta.requestId !== state.requestId) return;
        state.status = "idle";
        state.sessions = action.payload;
      })
      .addCase(fetchConversations.rejected, (state, action) => {
        if (action.meta.requestId !== state.requestId) return;
        state.status = "failed";
        state.error = action.error.message ?? "Couldn't load conversations.";
      })

      .addCase(fetchThread.pending, (state, action) => {
        state.threadStatus[action.meta.arg] = "loading";
      })
      .addCase(fetchThread.fulfilled, (state, action) => {
        state.threadStatus[action.meta.arg] = "idle";
        state.threads[action.meta.arg] = action.payload;
      })
      .addCase(fetchThread.rejected, (state, action) => {
        state.threadStatus[action.meta.arg] = "failed";
      })

      .addCase(reviewMessage.pending, (state) => {
        state.reviewStatus = "loading";
        state.error = null;
      })
      .addCase(reviewMessage.fulfilled, (state, action) => {
        state.reviewStatus = "idle";
        state.threads[action.payload.sessionId] = action.payload.messages;
        // Keep the queue's own count honest without a second round trip: the list is sorted by
        // what still needs eyes, and a stale badge is what sends someone back into a thread
        // they already finished.
        const unreviewed = action.payload.messages.filter((m) => m.role === "assistant" && !m.review_status).length;
        state.sessions = state.sessions.map((s) => (s.id === action.payload.sessionId ? { ...s, unreviewed } : s));
      })
      .addCase(reviewMessage.rejected, (state, action) => {
        state.reviewStatus = "failed";
        state.error = action.error.message ?? "Couldn't save that review.";
      });
  },
});

export const aiKnowledgeReviewsReducer = aiKnowledgeReviewsSlice.reducer;
