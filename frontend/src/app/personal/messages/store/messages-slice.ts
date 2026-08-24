// The student's chat store. All the reducer logic lives in the shared factory — see
// @/components/chat/create-chat-slice — because none of it is student-specific; only the
// endpoints are, and those come in as `messagesApi`.
//
// The named re-exports below are what the containers import, so this file's public shape
// is unchanged from when the slice was written out longhand here.

import { createChatSlice, type ChatState } from "@/components/chat/create-chat-slice";
import { messagesApi } from "../apis";

import type { RootState } from "@/lib/store";

const chat = createChatSlice({
  name: "messages",
  api: messagesApi,
  // Must point at the same key this reducer is mounted under in lib/store.ts.
  selectState: (root) => (root as RootState).messages,
});

export const {
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
} = chat;

export const messagesReducer = chat.reducer;

export type MessagesState = ChatState;
