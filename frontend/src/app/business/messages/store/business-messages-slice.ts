// The business side's chat store. All the reducer logic lives in the shared factory —
// see @/components/chat/create-chat-slice — because none of it differs between the two
// sides; only the endpoints do, and those come in as `businessMessagesApi`.
//
// Per-agent state (read cursor, favourites, stars) is a property of those endpoints, not
// of this file: the backend keys them on the acting user.

import { createChatSlice, type ChatState } from "@/components/chat/create-chat-slice";
import { businessMessagesApi } from "../apis";

import type { RootState } from "@/lib/store";

const chat = createChatSlice({
  name: "businessMessages",
  api: businessMessagesApi,
  // Must point at the same key this reducer is mounted under in lib/store.ts.
  selectState: (root) => (root as RootState).businessMessages,
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

export const businessMessagesReducer = chat.reducer;

export type BusinessMessagesState = ChatState;
