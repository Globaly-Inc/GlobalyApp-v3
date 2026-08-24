import { httpDelete, httpGet, httpPatch, httpPost, httpPostForm, httpPostNoContent } from "@/lib/api/http";
import { toChatThread, toStarredMessage } from "./types";

import type {
  BusinessStarredWire,
  BusinessThreadWire,
  ChatThread,
  EnquiryMessage,
  MessageAttachment,
  StarredMessage,
} from "./types";

/**
 * The business half of enquiry chat. Same conversations as the student side, reached
 * through the business-scoped prefix: every route here sits behind
 * requireBusinessContext + requirePermission("enquiries:respond"), so the org comes from
 * the access token rather than the URL.
 *
 * Note the two shapes in play: message-level actions are addressed by MESSAGE id under
 * `/messages/…`, thread-level ones by DISTRIBUTION id under `/:id/messages`. Static
 * segments win at each level, so the two never collide.
 */
export const businessMessagesRealApi = {
  // Mapped at the boundary: the wire names the counterpart `student_name`, the kit's
  // components read `counterpart_name`.
  listThreads: async (): Promise<{ threads: ChatThread[] }> => {
    const { threads } = await httpGet<{ threads: BusinessThreadWire[] }>("/enquiry-distributions/messages");
    return { threads: threads.map(toChatThread) };
  },

  getMessages: (distributionId: string): Promise<{ messages: EnquiryMessage[] }> =>
    httpGet(`/enquiry-distributions/${distributionId}/messages`),

  sendMessage: (distributionId: string, body: string, attachments: string[] = []): Promise<EnquiryMessage> =>
    httpPost(`/enquiry-distributions/${distributionId}/messages`, { body, attachments }),

  /**
   * Upload first, then send the returned storage_path with the message. Multipart, so it
   * goes through httpPostForm — the browser must set the boundary itself.
   */
  uploadAttachment: (file: File): Promise<MessageAttachment> => {
    const form = new FormData();
    form.append("file", file);
    return httpPostForm("/enquiry-distributions/messages/media", form);
  },

  /** 204 — the caller already knows the thread is now read. */
  markRead: (distributionId: string): Promise<void> =>
    httpPostNoContent(`/enquiry-distributions/${distributionId}/messages/read`),

  toggleFavorite: (distributionId: string): Promise<{ is_favorite: boolean }> =>
    httpPost(`/enquiry-distributions/${distributionId}/messages/favorite`, {}),

  listStarred: async (): Promise<{ messages: StarredMessage[] }> => {
    const { messages } = await httpGet<{ messages: BusinessStarredWire[] }>(
      "/enquiry-distributions/messages/starred",
    );
    return { messages: messages.map(toStarredMessage) };
  },

  toggleStar: (messageId: number): Promise<{ is_starred: boolean }> =>
    httpPost(`/enquiry-distributions/messages/stars/${messageId}`, {}),

  togglePin: (messageId: number): Promise<{ is_pinned: boolean }> =>
    httpPost(`/enquiry-distributions/messages/pins/${messageId}`, {}),

  /** Author-only; the server 404s a message written by anyone else, teammates included. */
  editMessage: (messageId: number, body: string): Promise<EnquiryMessage> =>
    httpPatch(`/enquiry-distributions/messages/${messageId}`, { body }),

  deleteMessage: (messageId: number): Promise<void> =>
    httpDelete(`/enquiry-distributions/messages/${messageId}`),

  toggleReaction: (messageId: number, emoji: string): Promise<{ reacted: boolean }> =>
    httpPost(`/enquiry-distributions/messages/reactions/${messageId}`, { emoji }),

  /** Replies under a message. Replying to a reply resolves to its parent server-side. */
  listReplies: (messageId: number): Promise<{ messages: EnquiryMessage[] }> =>
    httpGet(`/enquiry-distributions/messages/threads/${messageId}`),

  sendReply: (messageId: number, body: string, attachments: string[] = []): Promise<EnquiryMessage> =>
    httpPost(`/enquiry-distributions/messages/threads/${messageId}`, { body, attachments }),
};
