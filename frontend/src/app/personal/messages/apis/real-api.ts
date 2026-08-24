import { httpDelete, httpGet, httpPatch, httpPost, httpPostForm, httpPostNoContent } from "@/lib/api/http";
import type { EnquiryMessage, MessageAttachment, MessageThreadSummary, StarredMessage } from "./types";

export const messagesRealApi = {
  listThreads: (): Promise<{ threads: MessageThreadSummary[] }> => httpGet("/enquiry-messages"),

  getMessages: (distributionId: string): Promise<{ messages: EnquiryMessage[] }> =>
    httpGet(`/enquiry-messages/${distributionId}`),

  sendMessage: (distributionId: string, body: string, attachments: string[] = []): Promise<EnquiryMessage> =>
    httpPost(`/enquiry-messages/${distributionId}`, { body, attachments }),

  /**
   * Upload first, then send the returned storage_path with the message. Multipart, so it
   * goes through httpPostForm — the browser must set the boundary itself.
   */
  uploadAttachment: (file: File): Promise<MessageAttachment> => {
    const form = new FormData();
    form.append("file", file);
    return httpPostForm("/enquiry-messages/media", form);
  },

  /** 204 — the caller already knows the thread is now read. */
  markRead: (distributionId: string): Promise<void> =>
    httpPostNoContent(`/enquiry-messages/${distributionId}/read`),

  toggleFavorite: (distributionId: string): Promise<{ is_favorite: boolean }> =>
    httpPost(`/enquiry-messages/${distributionId}/favorite`, {}),

  listStarred: (): Promise<{ messages: StarredMessage[] }> => httpGet("/enquiry-messages/starred"),

  toggleStar: (messageId: number): Promise<{ is_starred: boolean }> =>
    httpPost(`/enquiry-messages/stars/${messageId}`, {}),

  togglePin: (messageId: number): Promise<{ is_pinned: boolean }> =>
    httpPost(`/enquiry-messages/pins/${messageId}`, {}),

  /** Sender-only; the server 404s a message that isn't yours. */
  editMessage: (messageId: number, body: string): Promise<EnquiryMessage> =>
    httpPatch(`/enquiry-messages/messages/${messageId}`, { body }),

  deleteMessage: (messageId: number): Promise<void> =>
    httpDelete(`/enquiry-messages/messages/${messageId}`),

  toggleReaction: (messageId: number, emoji: string): Promise<{ emoji: string; reacted: boolean }> =>
    httpPost(`/enquiry-messages/reactions/${messageId}`, { emoji }),

  /** Replies under a message. Replying to a reply resolves to its parent server-side. */
  listReplies: (messageId: number): Promise<{ messages: EnquiryMessage[] }> =>
    httpGet(`/enquiry-messages/threads/${messageId}`),

  sendReply: (messageId: number, body: string, attachments: string[] = []): Promise<EnquiryMessage> =>
    httpPost(`/enquiry-messages/threads/${messageId}`, { body, attachments }),
};
