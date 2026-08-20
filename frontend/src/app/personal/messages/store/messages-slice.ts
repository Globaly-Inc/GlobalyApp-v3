import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { messagesApi } from "../apis";

import type { EnquiryMessage, MessageThreadSummary } from "../apis/types";
import type { RootState } from "@/lib/store";

export const fetchThreads = createAsyncThunk("messages/fetchThreads", async () => (await messagesApi.listThreads()).threads, {
  condition: (_, { getState }) => (getState() as RootState).messages.threadsStatus !== "loading",
});

/**
 * Messages are keyed by distribution: several threads can be visited in one session and a
 * single `messages` array would clobber whichever was open last.
 */
export const fetchThreadMessages = createAsyncThunk(
  "messages/fetchMessages",
  async (distributionId: string) => ({
    distributionId,
    messages: (await messagesApi.getMessages(distributionId)).messages,
  }),
);

export const sendThreadMessage = createAsyncThunk(
  "messages/sendMessage",
  async ({ distributionId, body }: { distributionId: string; body: string }) => ({
    distributionId,
    message: await messagesApi.sendMessage(distributionId, body),
  }),
);

type MessagesState = {
  threads: MessageThreadSummary[];
  threadsStatus: "idle" | "loading" | "failed";
  error: string | null;
  byDistribution: Record<string, EnquiryMessage[]>;
  status: Record<string, "idle" | "loading" | "failed">;
};

const initialState: MessagesState = {
  threads: [],
  threadsStatus: "idle",
  error: null,
  byDistribution: {},
  status: {},
};

const messagesSlice = createSlice({
  name: "messages",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchThreads.pending, (state) => {
        state.threadsStatus = "loading";
        state.error = null;
      })
      .addCase(fetchThreads.fulfilled, (state, action) => {
        state.threadsStatus = "idle";
        state.threads = action.payload;
      })
      .addCase(fetchThreads.rejected, (state, action) => {
        state.threadsStatus = "failed";
        state.error = action.error.message ?? "Failed to load conversations";
      })

      .addCase(fetchThreadMessages.pending, (state, action) => {
        // Only "loading" on the FIRST load of a thread — the poll refetches every few
        // seconds and flipping to a spinner each time would make the thread flicker.
        const id = action.meta.arg;
        if (!state.byDistribution[id]) state.status[id] = "loading";
      })
      .addCase(fetchThreadMessages.fulfilled, (state, action) => {
        state.status[action.payload.distributionId] = "idle";
        state.byDistribution[action.payload.distributionId] = action.payload.messages;
      })
      .addCase(fetchThreadMessages.rejected, (state, action) => {
        state.status[action.meta.arg] = "failed";
      })

      .addCase(sendThreadMessage.fulfilled, (state, action) => {
        // Appended rather than refetched so the sender sees their message immediately; the
        // poll reconciles anything that arrived meanwhile.
        const { distributionId, message } = action.payload;
        state.byDistribution[distributionId] = [...(state.byDistribution[distributionId] ?? []), message];
      });
  },
});

export const messagesReducer = messagesSlice.reducer;
