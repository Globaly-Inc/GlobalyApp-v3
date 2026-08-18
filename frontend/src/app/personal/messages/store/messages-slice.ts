import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";

import { messagesApi } from "../apis";
import type { ConversationDetail, ConversationSummary, Message, Participant } from "../apis/types";

/* ── thunks ── */

export const fetchConversations = createAsyncThunk("messages/fetchConversations", async () => {
  const res = await messagesApi.listConversations();
  return res.data;
});

export const openConversation = createAsyncThunk(
  "messages/openConversation",
  async (conversationId: number) => {
    const detail = await messagesApi.getConversation(conversationId);
    // Opening a thread is what "reading" means here — the watermark moves immediately so
    // the badge clears without a second user action.
    await messagesApi.markRead(conversationId);
    return detail;
  },
);

export const sendMessage = createAsyncThunk(
  "messages/sendMessage",
  ({ conversationId, content }: { conversationId: number; content: string }) =>
    messagesApi.sendMessage(conversationId, content),
);

/* ── state ── */

type Status = "idle" | "loading" | "succeeded" | "failed";

type MessagesState = {
  conversations: ConversationSummary[];
  listStatus: Status;
  activeId: number | null;
  participants: Participant[];
  /** Oldest-first, the order the thread renders in. */
  messages: Message[];
  threadStatus: Status;
  sendStatus: Status;
  error: string | null;
};

const initialState: MessagesState = {
  conversations: [],
  listStatus: "idle",
  activeId: null,
  participants: [],
  messages: [],
  threadStatus: "idle",
  sendStatus: "idle",
  error: null,
};

/** Appends unless the id is already there — send-response and SSE frame can race. */
function upsert(messages: Message[], incoming: Message): Message[] {
  if (messages.some((m) => m.id === incoming.id)) return messages;
  return [...messages, incoming].sort((a, b) => a.id - b.id);
}

const messagesSlice = createSlice({
  name: "messages",
  initialState,
  reducers: {
    clearActiveConversation(state) {
      state.activeId = null;
      state.messages = [];
      state.participants = [];
      state.threadStatus = "idle";
    },
    /** One frame off the SSE stream. */
    messageReceived(state, action: PayloadAction<Message>) {
      const message = action.payload;
      if (message.conversation_id === state.activeId) {
        state.messages = upsert(state.messages, message);
      }
      const conversation = state.conversations.find((c) => c.id === message.conversation_id);
      if (!conversation) return;
      conversation.last_message = {
        id: message.id,
        content: message.content,
        message_type: message.message_type,
        sender_id: message.sender_id,
        created_at: message.created_at,
      };
      // A message arriving in the thread the user is looking at is read on arrival.
      if (message.conversation_id !== state.activeId) conversation.unread_count += 1;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchConversations.pending, (state) => {
        state.listStatus = "loading";
        state.error = null;
      })
      .addCase(fetchConversations.fulfilled, (state, action: PayloadAction<ConversationSummary[]>) => {
        state.listStatus = "succeeded";
        state.conversations = action.payload;
      })
      .addCase(fetchConversations.rejected, (state, action) => {
        state.listStatus = "failed";
        state.error = action.error.message ?? "Could not load your conversations.";
      })
      .addCase(openConversation.pending, (state, action) => {
        state.threadStatus = "loading";
        state.activeId = action.meta.arg;
        state.messages = [];
        state.error = null;
      })
      .addCase(openConversation.fulfilled, (state, action: PayloadAction<ConversationDetail>) => {
        state.threadStatus = "succeeded";
        state.participants = action.payload.participants;
        // The API pages newest-first; the thread reads oldest-first.
        state.messages = [...action.payload.messages.data].sort((a, b) => a.id - b.id);
        const conversation = state.conversations.find((c) => c.id === action.payload.conversation.id);
        if (conversation) conversation.unread_count = 0;
      })
      .addCase(openConversation.rejected, (state, action) => {
        state.threadStatus = "failed";
        state.error = action.error.message ?? "Could not open that conversation.";
      })
      .addCase(sendMessage.pending, (state) => {
        state.sendStatus = "loading";
      })
      .addCase(sendMessage.fulfilled, (state, action: PayloadAction<Message>) => {
        state.sendStatus = "succeeded";
        if (action.payload.conversation_id === state.activeId) {
          state.messages = upsert(state.messages, action.payload);
        }
      })
      .addCase(sendMessage.rejected, (state, action) => {
        state.sendStatus = "failed";
        state.error = action.error.message ?? "Your message could not be sent.";
      });
  },
});

export const { clearActiveConversation, messageReceived } = messagesSlice.actions;
export const messagesReducer = messagesSlice.reducer;
