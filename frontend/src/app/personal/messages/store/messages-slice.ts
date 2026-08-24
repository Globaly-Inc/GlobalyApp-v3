import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { messagesApi } from "../apis";

import type { EnquiryMessage, MessageThreadSummary, StarredMessage } from "../apis/types";
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
  async ({
    distributionId,
    body,
    attachments = [],
  }: {
    distributionId: string;
    body: string;
    /** Storage paths from uploadAttachment — the bytes are already in storage. */
    attachments?: string[];
  }) => ({
    distributionId,
    message: await messagesApi.sendMessage(distributionId, body, attachments),
  }),
);

/**
 * Clears the thread's unread count. Fire-and-forget from the UI's point of view — the
 * reducer zeroes the badge on `pending` so opening a thread feels instant, and a failed
 * request just leaves the server's count to reappear on the next inbox load.
 */
export const markThreadRead = createAsyncThunk("messages/markRead", async (distributionId: string) => {
  await messagesApi.markRead(distributionId);
  return distributionId;
});

export const toggleThreadFavorite = createAsyncThunk("messages/toggleFavorite", async (distributionId: string) => ({
  distributionId,
  isFavorite: (await messagesApi.toggleFavorite(distributionId)).is_favorite,
}));

export const fetchStarredMessages = createAsyncThunk(
  "messages/fetchStarred",
  async () => (await messagesApi.listStarred()).messages,
);

export const toggleMessageStar = createAsyncThunk(
  "messages/toggleStar",
  async ({ messageId }: { messageId: number; distributionId: string }) => ({
    messageId,
    isStarred: (await messagesApi.toggleStar(messageId)).is_starred,
  }),
);

/**
 * A pin is conversation state, not the viewer's, so unlike a star there is no separate
 * list to keep in step — the thread's own message carries it.
 */
export const toggleMessagePin = createAsyncThunk(
  "messages/togglePin",
  async ({ messageId }: { messageId: number; distributionId: string }) => ({
    messageId,
    isPinned: (await messagesApi.togglePin(messageId)).is_pinned,
  }),
);

/**
 * Reactions are per person but visible to both sides, so the reducer patches the chip
 * locally rather than refetching the thread on every click.
 */
export const toggleMessageReaction = createAsyncThunk(
  "messages/toggleReaction",
  async ({ messageId, emoji }: { messageId: number; emoji: string; distributionId: string }) => ({
    messageId,
    emoji,
    reacted: (await messagesApi.toggleReaction(messageId, emoji)).reacted,
  }),
);

export const fetchThreadReplies = createAsyncThunk("messages/fetchReplies", async (messageId: number) => ({
  messageId,
  replies: (await messagesApi.listReplies(messageId)).messages,
}));

export const sendThreadReply = createAsyncThunk(
  "messages/sendReply",
  async ({
    messageId,
    body,
    attachments = [],
  }: {
    messageId: number;
    body: string;
    attachments?: string[];
    /** Carried so the reducer can bump the parent's reply_count in the main list. */
    distributionId: string;
  }) => ({ messageId, reply: await messagesApi.sendReply(messageId, body, attachments) }),
);

export const editMessage = createAsyncThunk(
  "messages/editMessage",
  async ({ messageId, body }: { messageId: number; body: string; distributionId: string }) => ({
    messageId,
    message: await messagesApi.editMessage(messageId, body),
  }),
);

export const deleteMessage = createAsyncThunk(
  "messages/deleteMessage",
  async ({ messageId }: { messageId: number; distributionId: string }) => {
    await messagesApi.deleteMessage(messageId);
    return messageId;
  },
);

type MessagesState = {
  threads: MessageThreadSummary[];
  threadsStatus: "idle" | "loading" | "failed";
  error: string | null;
  byDistribution: Record<string, EnquiryMessage[]>;
  status: Record<string, "idle" | "loading" | "failed">;
  starred: StarredMessage[];
  starredStatus: "idle" | "loading" | "failed";
  /** Thread replies, keyed by parent message id — same reasoning as byDistribution. */
  repliesByParent: Record<number, EnquiryMessage[]>;
  repliesStatus: Record<number, "idle" | "loading" | "failed">;
};

const initialState: MessagesState = {
  threads: [],
  threadsStatus: "idle",
  error: null,
  byDistribution: {},
  status: {},
  starred: [],
  starredStatus: "idle",
  repliesByParent: {},
  repliesStatus: {},
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
        // Keep the sidebar row in step without a second inbox fetch — the preview line
        // and its position both come off last_message_at.
        const thread = state.threads.find((t) => t.distribution_id === distributionId);
        if (thread) {
          thread.last_message_at = message.created_at;
          // An attachment-only message has no text, so the preview names the file
          // instead of going blank in the sidebar.
          thread.last_message_body = message.body || message.attachments[0]?.original_name || null;
          thread.last_message_is_mine = true;
        }
      })

      // Optimistic on `pending`: the badge must disappear the moment the thread opens.
      .addCase(markThreadRead.pending, (state, action) => {
        const thread = state.threads.find((t) => t.distribution_id === action.meta.arg);
        if (thread) thread.unread_count = 0;
      })

      .addCase(toggleThreadFavorite.fulfilled, (state, action) => {
        const thread = state.threads.find((t) => t.distribution_id === action.payload.distributionId);
        if (thread) thread.is_favorite = action.payload.isFavorite;
      })

      .addCase(fetchStarredMessages.pending, (state) => {
        state.starredStatus = "loading";
      })
      .addCase(fetchStarredMessages.fulfilled, (state, action) => {
        state.starredStatus = "idle";
        state.starred = action.payload;
      })
      .addCase(fetchStarredMessages.rejected, (state) => {
        state.starredStatus = "failed";
      })

      .addCase(editMessage.fulfilled, (state, action) => {
        const { messageId, message } = action.payload;
        // The message can be in the main list or in a thread — patch wherever it lives.
        const inList = state.byDistribution[action.meta.arg.distributionId]?.find((m) => m.id === messageId);
        if (inList) Object.assign(inList, message);
        for (const replies of Object.values(state.repliesByParent)) {
          const reply = replies.find((m) => m.id === messageId);
          if (reply) Object.assign(reply, message);
        }
        const thread = state.threads.find((t) => t.distribution_id === action.meta.arg.distributionId);
        // The sidebar preview may be quoting the message that just changed.
        if (thread && inList && !state.byDistribution[action.meta.arg.distributionId]?.some((m) => m.id > messageId)) {
          thread.last_message_body = message.body;
        }
      })

      .addCase(deleteMessage.fulfilled, (state, action) => {
        const messageId = action.payload;
        const { distributionId } = action.meta.arg;
        const list = state.byDistribution[distributionId];
        if (list) state.byDistribution[distributionId] = list.filter((m) => m.id !== messageId);
        for (const [parentId, replies] of Object.entries(state.repliesByParent)) {
          const next = replies.filter((m) => m.id !== messageId);
          if (next.length === replies.length) continue;
          state.repliesByParent[Number(parentId)] = next;
          // Deleting a reply drops the parent's count with it.
          const parent = state.byDistribution[distributionId]?.find((m) => m.id === Number(parentId));
          if (parent) parent.reply_count = Math.max(0, parent.reply_count - 1);
        }
        // A starred message that is gone must leave the Starred view too.
        state.starred = state.starred.filter((m) => m.id !== messageId);
      })

      .addCase(toggleMessageReaction.fulfilled, (state, action) => {
        const { messageId, emoji, reacted } = action.payload;
        // The message may be in the main list or in a thread — patch wherever it lives.
        const message =
          state.byDistribution[action.meta.arg.distributionId]?.find((m) => m.id === messageId) ??
          Object.values(state.repliesByParent)
            .flat()
            .find((m) => m.id === messageId);
        if (!message) return;
        const existing = message.reactions.find((r) => r.emoji === emoji);
        if (reacted) {
          if (existing) {
            existing.count += 1;
            existing.mine = true;
            existing.users.push("You");
          } else {
            message.reactions.push({ emoji, count: 1, users: ["You"], mine: true });
          }
        } else if (existing) {
          existing.count -= 1;
          existing.mine = false;
          existing.users = existing.users.filter((u) => u !== "You");
          // A chip nobody is using any more should disappear, not sit at zero.
          if (existing.count <= 0) message.reactions = message.reactions.filter((r) => r.emoji !== emoji);
        }
      })

      .addCase(fetchThreadReplies.pending, (state, action) => {
        if (!state.repliesByParent[action.meta.arg]) state.repliesStatus[action.meta.arg] = "loading";
      })
      .addCase(fetchThreadReplies.fulfilled, (state, action) => {
        state.repliesStatus[action.payload.messageId] = "idle";
        state.repliesByParent[action.payload.messageId] = action.payload.replies;
      })
      .addCase(fetchThreadReplies.rejected, (state, action) => {
        state.repliesStatus[action.meta.arg] = "failed";
      })

      .addCase(sendThreadReply.fulfilled, (state, action) => {
        const { reply } = action.payload;
        // The server anchors a reply-to-a-reply onto its parent, so trust reply_to_id
        // over the id that was clicked.
        const parentId = reply.reply_to_id ?? action.payload.messageId;
        state.repliesByParent[parentId] = [...(state.repliesByParent[parentId] ?? []), reply];
        // Keep the "N replies" link on the parent in step without refetching the thread.
        const parent = state.byDistribution[action.meta.arg.distributionId]?.find((m) => m.id === parentId);
        if (parent) parent.reply_count += 1;
      })

      .addCase(toggleMessagePin.fulfilled, (state, action) => {
        const message = state.byDistribution[action.meta.arg.distributionId]?.find(
          (m) => m.id === action.payload.messageId,
        );
        if (message) message.is_pinned = action.payload.isPinned;
      })

      .addCase(toggleMessageStar.fulfilled, (state, action) => {
        const { messageId, isStarred } = action.payload;
        const thread = state.byDistribution[action.meta.arg.distributionId];
        const message = thread?.find((m) => m.id === messageId);
        if (message) message.is_starred = isStarred;
        // The Starred view reads this list, so keep it consistent without a refetch —
        // un-starring from inside a thread has to remove the row there too.
        if (!isStarred) {
          state.starred = state.starred.filter((m) => m.id !== messageId);
        } else if (message && !state.starred.some((m) => m.id === messageId)) {
          const summary = state.threads.find((t) => t.distribution_id === action.meta.arg.distributionId);
          if (summary) {
            state.starred = [
              {
                ...message,
                is_starred: true,
                distribution_id: summary.distribution_id,
                business_name: summary.business_name,
                course_name: summary.course_name,
              },
              ...state.starred,
            ];
          }
        }
      });
  },
});

export const messagesReducer = messagesSlice.reducer;
