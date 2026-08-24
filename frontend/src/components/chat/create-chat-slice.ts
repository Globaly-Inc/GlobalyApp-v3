// The chat store, built once for both sides.
//
// Every reducer here is about MESSAGES, not about who is reading them: append a sent
// message, zero an unread badge, patch a reaction chip, keep the Starred list in step.
// None of that differs between a student and a business agent — only the endpoints do,
// and those arrive as `api`. So this is a factory rather than two 340-line slices that
// would have to be kept in step by hand.
//
// Each feature still owns a `store/<feature>-slice.ts` that calls this and re-exports the
// thunks, so call sites and the AGENTS.md feature shape are unchanged.

import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { ChatThread, EnquiryMessage, MessageAttachment, StarredMessage } from "./types";

/**
 * What a chat feature's api module must provide. Both sides' `apis/index.ts` satisfy
 * this, which is what makes them interchangeable here — and the compiler checks it.
 */
export interface ChatApi {
  listThreads(): Promise<{ threads: ChatThread[] }>;
  getMessages(distributionId: string): Promise<{ messages: EnquiryMessage[] }>;
  sendMessage(distributionId: string, body: string, attachments?: string[]): Promise<EnquiryMessage>;
  uploadAttachment(file: File): Promise<MessageAttachment>;
  markRead(distributionId: string): Promise<void>;
  toggleFavorite(distributionId: string): Promise<{ is_favorite: boolean }>;
  listStarred(): Promise<{ messages: StarredMessage[] }>;
  toggleStar(messageId: number): Promise<{ is_starred: boolean }>;
  togglePin(messageId: number): Promise<{ is_pinned: boolean }>;
  editMessage(messageId: number, body: string): Promise<EnquiryMessage>;
  deleteMessage(messageId: number): Promise<void>;
  toggleReaction(messageId: number, emoji: string): Promise<{ reacted: boolean }>;
  listReplies(messageId: number): Promise<{ messages: EnquiryMessage[] }>;
  sendReply(messageId: number, body: string, attachments?: string[]): Promise<EnquiryMessage>;
}

export type ChatStatus = "idle" | "loading" | "failed";

export interface ChatState {
  threads: ChatThread[];
  threadsStatus: ChatStatus;
  error: string | null;
  /**
   * Messages keyed by distribution: several threads can be visited in one session and a
   * single `messages` array would clobber whichever was open last.
   */
  byDistribution: Record<string, EnquiryMessage[]>;
  status: Record<string, ChatStatus>;
  starred: StarredMessage[];
  starredStatus: ChatStatus;
  /** Thread replies, keyed by parent message id — same reasoning as byDistribution. */
  repliesByParent: Record<number, EnquiryMessage[]>;
  repliesStatus: Record<number, ChatStatus>;
}

const initialState: ChatState = {
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

/** Args shared by every message-level thunk. `distributionId` is what the reducers patch. */
type MessageArg = { messageId: number; distributionId: string };

export function createChatSlice({
  name,
  api,
  selectState,
}: {
  /** Action-type prefix and slice name. Must match the key in lib/store.ts. */
  name: string;
  api: ChatApi;
  /** Reads this slice out of the root state — used by the inbox thunk's dedupe guard. */
  selectState: (root: unknown) => ChatState;
}) {
  const fetchThreads = createAsyncThunk(`${name}/fetchThreads`, async () => (await api.listThreads()).threads, {
    condition: (_, { getState }) => selectState(getState()).threadsStatus !== "loading",
  });

  const fetchThreadMessages = createAsyncThunk(`${name}/fetchMessages`, async (distributionId: string) => ({
    distributionId,
    messages: (await api.getMessages(distributionId)).messages,
  }));

  const sendThreadMessage = createAsyncThunk(
    `${name}/sendMessage`,
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
      message: await api.sendMessage(distributionId, body, attachments),
    }),
  );

  /**
   * Clears the thread's unread count. Fire-and-forget from the UI's point of view — the
   * reducer zeroes the badge on `pending` so opening a thread feels instant, and a failed
   * request just leaves the server's count to reappear on the next inbox load.
   */
  const markThreadRead = createAsyncThunk(`${name}/markRead`, async (distributionId: string) => {
    await api.markRead(distributionId);
    return distributionId;
  });

  const toggleThreadFavorite = createAsyncThunk(`${name}/toggleFavorite`, async (distributionId: string) => ({
    distributionId,
    isFavorite: (await api.toggleFavorite(distributionId)).is_favorite,
  }));

  const fetchStarredMessages = createAsyncThunk(
    `${name}/fetchStarred`,
    async () => (await api.listStarred()).messages,
  );

  const toggleMessageStar = createAsyncThunk(`${name}/toggleStar`, async ({ messageId }: MessageArg) => ({
    messageId,
    isStarred: (await api.toggleStar(messageId)).is_starred,
  }));

  /**
   * A pin is conversation state, not the viewer's, so unlike a star there is no separate
   * list to keep in step — the thread's own message carries it.
   */
  const toggleMessagePin = createAsyncThunk(`${name}/togglePin`, async ({ messageId }: MessageArg) => ({
    messageId,
    isPinned: (await api.togglePin(messageId)).is_pinned,
  }));

  /**
   * Reactions are per person but visible to both sides, so the reducer patches the chip
   * locally rather than refetching the thread on every click.
   */
  const toggleMessageReaction = createAsyncThunk(
    `${name}/toggleReaction`,
    async ({ messageId, emoji }: MessageArg & { emoji: string }) => ({
      messageId,
      emoji,
      reacted: (await api.toggleReaction(messageId, emoji)).reacted,
    }),
  );

  const fetchThreadReplies = createAsyncThunk(`${name}/fetchReplies`, async (messageId: number) => ({
    messageId,
    replies: (await api.listReplies(messageId)).messages,
  }));

  const sendThreadReply = createAsyncThunk(
    `${name}/sendReply`,
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
    }) => ({ messageId, reply: await api.sendReply(messageId, body, attachments) }),
  );

  const editMessage = createAsyncThunk(
    `${name}/editMessage`,
    async ({ messageId, body }: MessageArg & { body: string }) => ({
      messageId,
      message: await api.editMessage(messageId, body),
    }),
  );

  const deleteMessage = createAsyncThunk(`${name}/deleteMessage`, async ({ messageId }: MessageArg) => {
    await api.deleteMessage(messageId);
    return messageId;
  });

  const slice = createSlice({
    name,
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
          if (
            thread &&
            inList &&
            !state.byDistribution[action.meta.arg.distributionId]?.some((m) => m.id > messageId)
          ) {
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
                  counterpart_name: summary.counterpart_name,
                  course_name: summary.course_name,
                },
                ...state.starred,
              ];
            }
          }
        });
    },
  });

  return {
    reducer: slice.reducer as (state: ChatState | undefined, action: PayloadAction<unknown>) => ChatState,
    fetchThreads,
    fetchThreadMessages,
    sendThreadMessage,
    markThreadRead,
    toggleThreadFavorite,
    fetchStarredMessages,
    toggleMessageStar,
    toggleMessagePin,
    toggleMessageReaction,
    fetchThreadReplies,
    sendThreadReply,
    editMessage,
    deleteMessage,
  };
}
