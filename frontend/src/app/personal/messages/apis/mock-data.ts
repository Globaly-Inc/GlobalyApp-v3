import type { EnquiryMessage, MessageAttachment, ChatThread, StarredMessage } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const mockThreadList: ChatThread[] = [
  {
    distribution_id: "dist-mock-1",
    enquiry_id: "enq-2",
    title: null,
    thread_photo: null,
    counterpart_name: "Sydney Study Agents",
    counterpart_avatar: null,
    course_name: "Mock Bachelor of Computer Science",
    is_closed: false,
    unlocked_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    last_message_at: new Date(Date.now() - 3600_000).toISOString(),
    last_message_body: "Hi! I saw your enquiry about this course and I'd be glad to help.",
    last_message_is_mine: false,
    unread_count: 1,
    is_favorite: true,
  },
  {
    distribution_id: "dist-mock-2",
    enquiry_id: "enq-2",
    title: null,
    thread_photo: null,
    counterpart_name: "Parramatta Education",
    counterpart_avatar: null,
    course_name: "Mock Bachelor of Computer Science",
    is_closed: true,
    unlocked_at: new Date(Date.now() - 86400000).toISOString(),
    last_message_at: null,
    last_message_body: null,
    last_message_is_mine: false,
    unread_count: 0,
    is_favorite: false,
  },
];

const mockThreads = new Map<string, EnquiryMessage[]>([
  [
    "dist-mock-1",
    [
      {
        id: 1,
        body: "Hi! I saw your enquiry about this course and I'd be glad to help.",
        created_at: new Date(Date.now() - 3600_000).toISOString(),
        sender_id: 99,
        sender_name: "Sydney Study Agents",
        sender_avatar: null,
        is_mine: false,
        sender_role: "business",
        is_starred: false,
        is_pinned: false,
        attachments: [],
        reply_to_id: null,
        reply_count: 0,
        reactions: [],
        edited_at: null,
        kind: "message",
      },
    ],
  ],
]);

/** Mutated by toggleStar so the Starred view reflects clicks without a real backend. */
const starredIds = new Set<number>();
/** Same, for the conversation pins the info panel reads. */
const pinnedIds = new Set<number>();
/** Uploads handed out this session, so a sent message can echo their metadata back. */
const mockUploads = new Map<string, MessageAttachment>();
/** emoji -> set of message ids the mock viewer reacted to. */
const mockReactions = new Map<number, Set<string>>();
/** parent message id -> its replies. */
const mockReplies = new Map<number, EnquiryMessage[]>();
let mockNextId = 1000;

/** Rebuilds the reaction chips the viewer has toggled on this message. */
const chipsFor = (id: number) =>
  [...(mockReactions.get(id) ?? [])].map((emoji) => ({ emoji, count: 1, users: ["You"], mine: true }));

export const messagesMockApi = {
  listThreads: async (): Promise<{ threads: ChatThread[] }> => {
    console.log("[mock] GET /enquiry-messages");
    await delay(200);
    return { threads: mockThreadList };
  },

  getMessages: async (distributionId: string): Promise<{ messages: EnquiryMessage[] }> => {
    console.log("[mock] GET /enquiry-messages/:id", { distributionId });
    await delay(200);
    const thread = mockThreads.get(distributionId) ?? [];
    return {
      messages: thread.map((m) => ({
        ...m,
        is_starred: starredIds.has(m.id),
        is_pinned: pinnedIds.has(m.id),
        reactions: chipsFor(m.id),
        reply_count: mockReplies.get(m.id)?.length ?? 0,
      })),
    };
  },

  sendMessage: async (distributionId: string, body: string, attachments: string[] = []): Promise<EnquiryMessage> => {
    console.log("[mock] POST /enquiry-messages/:id", { distributionId, body, attachments });
    await delay(250);
    const thread = mockThreads.get(distributionId) ?? [];
    const message: EnquiryMessage = {
      id: (thread.at(-1)?.id ?? 0) + 1,
      body,
      created_at: new Date().toISOString(),
      sender_id: 1,
      sender_name: "You",
      sender_avatar: null,
      is_mine: true,
      sender_role: "student",
      is_starred: false,
      is_pinned: false,
      // Echoed back from whatever uploadAttachment handed out this session.
      attachments: attachments.map((path) => mockUploads.get(path)).filter((a): a is MessageAttachment => !!a),
      reply_to_id: null,
      reply_count: 0,
      reactions: [],
      edited_at: null,
      kind: "message",
    };
    mockThreads.set(distributionId, [...thread, message]);
    return message;
  },

  markRead: async (distributionId: string): Promise<void> => {
    console.log("[mock] POST /enquiry-messages/:id/read", { distributionId });
    await delay(80);
    const thread = mockThreadList.find((t) => t.distribution_id === distributionId);
    if (thread) thread.unread_count = 0;
  },

  toggleFavorite: async (distributionId: string): Promise<{ is_favorite: boolean }> => {
    console.log("[mock] POST /enquiry-messages/:id/favorite", { distributionId });
    await delay(120);
    const thread = mockThreadList.find((t) => t.distribution_id === distributionId);
    if (thread) thread.is_favorite = !thread.is_favorite;
    return { is_favorite: thread?.is_favorite ?? false };
  },

  listStarred: async (): Promise<{ messages: StarredMessage[] }> => {
    console.log("[mock] GET /enquiry-messages/starred");
    await delay(200);
    const messages: StarredMessage[] = [];
    for (const thread of mockThreadList) {
      for (const m of mockThreads.get(thread.distribution_id) ?? []) {
        if (!starredIds.has(m.id)) continue;
        messages.push({
          ...m,
          is_starred: true,
          distribution_id: thread.distribution_id,
          counterpart_name: thread.counterpart_name,
          course_name: thread.course_name,
        });
      }
    }
    return { messages };
  },

  toggleStar: async (messageId: number): Promise<{ is_starred: boolean }> => {
    console.log("[mock] POST /enquiry-messages/stars/:messageId", { messageId });
    await delay(120);
    if (starredIds.delete(messageId)) return { is_starred: false };
    starredIds.add(messageId);
    return { is_starred: true };
  },

  uploadAttachment: async (file: File): Promise<MessageAttachment> => {
    console.log("[mock] POST /enquiry-messages/media", { name: file.name, size: file.size });
    await delay(400);
    const attachment: MessageAttachment = {
      storage_path: `mock/${Date.now()}-${file.name}`,
      original_name: file.name,
      mime_type: file.type,
      size_bytes: file.size,
      // A local blob URL previews and downloads exactly like the real signed URL would.
      url: URL.createObjectURL(file),
    };
    mockUploads.set(attachment.storage_path, attachment);
    return attachment;
  },

  editMessage: async (messageId: number, body: string): Promise<EnquiryMessage> => {
    console.log("[mock] PATCH /enquiry-messages/messages/:messageId", { messageId, body });
    await delay(200);
    for (const thread of mockThreads.values()) {
      const found = thread.find((m) => m.id === messageId);
      if (found) {
        found.body = body;
        found.edited_at = new Date().toISOString();
        return found;
      }
    }
    throw new Error("Message not found");
  },

  deleteMessage: async (messageId: number): Promise<void> => {
    console.log("[mock] DELETE /enquiry-messages/messages/:messageId", { messageId });
    await delay(200);
    for (const [id, thread] of mockThreads.entries()) {
      mockThreads.set(id, thread.filter((m) => m.id !== messageId));
    }
  },

  toggleReaction: async (messageId: number, emoji: string): Promise<{ emoji: string; reacted: boolean }> => {
    console.log("[mock] POST /enquiry-messages/reactions/:messageId", { messageId, emoji });
    await delay(120);
    const set = mockReactions.get(messageId) ?? new Set<string>();
    const reacted = !set.delete(emoji);
    if (reacted) set.add(emoji);
    mockReactions.set(messageId, set);
    return { emoji, reacted };
  },

  listReplies: async (messageId: number): Promise<{ messages: EnquiryMessage[] }> => {
    console.log("[mock] GET /enquiry-messages/threads/:messageId", { messageId });
    await delay(200);
    return { messages: mockReplies.get(messageId) ?? [] };
  },

  sendReply: async (messageId: number, body: string, attachments: string[] = []): Promise<EnquiryMessage> => {
    console.log("[mock] POST /enquiry-messages/threads/:messageId", { messageId, body, attachments });
    await delay(250);
    const reply: EnquiryMessage = {
      id: ++mockNextId,
      body,
      created_at: new Date().toISOString(),
      sender_id: 1,
      sender_name: "You",
      sender_avatar: null,
      is_mine: true,
      sender_role: "student",
      is_starred: false,
      is_pinned: false,
      attachments: attachments.map((path) => mockUploads.get(path)).filter((a): a is MessageAttachment => !!a),
      reply_to_id: messageId,
      reply_count: 0,
      reactions: [],
      edited_at: null,
      kind: "message",
    };
    mockReplies.set(messageId, [...(mockReplies.get(messageId) ?? []), reply]);
    return reply;
  },

  togglePin: async (messageId: number): Promise<{ is_pinned: boolean }> => {
    console.log("[mock] POST /enquiry-messages/pins/:messageId", { messageId });
    await delay(120);
    if (pinnedIds.delete(messageId)) return { is_pinned: false };
    pinnedIds.add(messageId);
    return { is_pinned: true };
  },

  leaveThread: async (distributionId: string): Promise<void> => {
    console.log("[mock] POST /enquiry-messages/:id/leave", { distributionId });
    await delay(200);
  },
};
