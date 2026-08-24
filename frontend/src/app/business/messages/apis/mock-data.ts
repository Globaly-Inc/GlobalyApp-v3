// In-memory fake of the business chat endpoints, used whenever NEXT_PUBLIC_MOCK_DATA is
// not "false". Deliberately leaner than the student mock: this is dev scaffolding, so it
// seeds two threads and keeps just enough state for the toggles to feel real.
//
// ponytail: not shared with the student mock. The handler bodies are small and the seed
// data is what actually differs; a factory would parameterise more than it saved. Fold
// them together if a third chat surface ever appears.

import type { ChatThread, EnquiryMessage, MessageAttachment, StarredMessage } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The agent looking at the mock. Their own messages come back `is_mine`. */
const ME = { id: 7, name: "You" };
/** A colleague, so the intra-team attribution path has something to render. */
const TEAMMATE = { id: 8, name: "Priya Raman" };

const mockThreadList: ChatThread[] = [
  {
    distribution_id: "dist-biz-1",
    enquiry_id: "enq-biz-1",
    counterpart_name: "Aarav Sharma",
    counterpart_avatar: null,
    course_name: "Mock Bachelor of Computer Science",
    is_closed: false,
    unlocked_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    last_message_at: new Date(Date.now() - 1800_000).toISOString(),
    last_message_body: "Could you tell me about the scholarship options?",
    last_message_is_mine: false,
    unread_count: 2,
    is_favorite: true,
  },
  {
    distribution_id: "dist-biz-2",
    enquiry_id: "enq-biz-2",
    counterpart_name: "Mei Lin",
    counterpart_avatar: null,
    course_name: "Mock Master of Data Science",
    is_closed: true,
    unlocked_at: new Date(Date.now() - 9 * 86400000).toISOString(),
    last_message_at: new Date(Date.now() - 7 * 86400000).toISOString(),
    last_message_body: "Thanks for your help — I've accepted the offer.",
    last_message_is_mine: false,
    unread_count: 0,
    is_favorite: false,
  },
];

const message = (over: Partial<EnquiryMessage> & { id: number; body: string }): EnquiryMessage => ({
  created_at: new Date(Date.now() - 3600_000).toISOString(),
  sender_id: ME.id,
  sender_name: ME.name,
  sender_avatar: null,
  is_mine: true,
  sender_role: "business",
  is_starred: false,
  is_pinned: false,
  attachments: [],
  reply_to_id: null,
  reply_count: 0,
  reactions: [],
  edited_at: null,
  ...over,
});

/** Marks a message as the student's — the counterpart, so never `is_mine`. */
const fromStudent = (over: Partial<EnquiryMessage> & { id: number; body: string }): EnquiryMessage =>
  message({ sender_id: 42, sender_name: "Aarav Sharma", is_mine: false, sender_role: "student", ...over });

const mockThreads = new Map<string, EnquiryMessage[]>([
  [
    "dist-biz-1",
    [
      message({
        id: 101,
        body: "Hi! Thanks for your enquiry — we've unlocked it and we're happy to help.",
        created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
      }),
      fromStudent({
        id: 102,
        body: "Great, thank you. What are the English requirements?",
        created_at: new Date(Date.now() - 86400000).toISOString(),
      }),
      // A teammate's reply: not mine, but still our side. This is the row that proves
      // intra-team attribution renders the colleague's name rather than "You".
      message({
        id: 103,
        body: "IELTS 6.5 overall, with no band below 6.0.",
        sender_id: TEAMMATE.id,
        sender_name: TEAMMATE.name,
        is_mine: false,
        created_at: new Date(Date.now() - 7200_000).toISOString(),
        reply_count: 1,
      }),
      fromStudent({
        id: 104,
        body: "Could you tell me about the scholarship options?",
        created_at: new Date(Date.now() - 1800_000).toISOString(),
      }),
    ],
  ],
  [
    "dist-biz-2",
    [
      fromStudent({
        id: 201,
        body: "Thanks for your help — I've accepted the offer.",
        sender_name: "Mei Lin",
        created_at: new Date(Date.now() - 7 * 86400000).toISOString(),
      }),
    ],
  ],
]);

const mockReplies = new Map<number, EnquiryMessage[]>([
  [103, [fromStudent({ id: 301, body: "Perfect — I have 7.0.", reply_to_id: 103 })]],
]);
const mockUploads = new Map<string, MessageAttachment>();
const starredIds = new Set<number>();
const pinnedIds = new Set<number>();
const favorites = new Set<string>(["dist-biz-1"]);
const mockReactions = new Map<number, Set<string>>();
let mockNextId = 400;

const threadOf = (messageId: number) =>
  [...mockThreads.entries()].find(([, list]) => list.some((m) => m.id === messageId));

export const businessMessagesMockApi = {
  listThreads: async (): Promise<{ threads: ChatThread[] }> => {
    console.log("[mock] GET /enquiry-distributions/messages");
    await delay(250);
    return { threads: mockThreadList.map((t) => ({ ...t, is_favorite: favorites.has(t.distribution_id) })) };
  },

  getMessages: async (distributionId: string): Promise<{ messages: EnquiryMessage[] }> => {
    console.log("[mock] GET /enquiry-distributions/:id/messages", { distributionId });
    await delay(250);
    const list = (mockThreads.get(distributionId) ?? []).map((m) => ({
      ...m,
      is_starred: starredIds.has(m.id),
      is_pinned: pinnedIds.has(m.id),
      reactions: [...(mockReactions.get(m.id) ?? [])].map((emoji) => ({
        emoji,
        count: 1,
        users: [ME.name],
        mine: true,
      })),
    }));
    return { messages: list };
  },

  sendMessage: async (distributionId: string, body: string, attachments: string[] = []): Promise<EnquiryMessage> => {
    console.log("[mock] POST /enquiry-distributions/:id/messages", { distributionId, body, attachments });
    await delay(250);
    const sent = message({
      id: ++mockNextId,
      body,
      created_at: new Date().toISOString(),
      attachments: attachments.map((p) => mockUploads.get(p)).filter((a): a is MessageAttachment => !!a),
    });
    mockThreads.set(distributionId, [...(mockThreads.get(distributionId) ?? []), sent]);
    return sent;
  },

  uploadAttachment: async (file: File): Promise<MessageAttachment> => {
    console.log("[mock] POST /enquiry-distributions/messages/media", { name: file.name });
    await delay(400);
    const attachment: MessageAttachment = {
      storage_path: `mock/business/${Date.now()}-${file.name}`,
      original_name: file.name,
      mime_type: file.type,
      size_bytes: file.size,
      // A local blob URL previews and downloads exactly like the real signed URL would.
      url: URL.createObjectURL(file),
    };
    mockUploads.set(attachment.storage_path, attachment);
    return attachment;
  },

  markRead: async (distributionId: string): Promise<void> => {
    console.log("[mock] POST /enquiry-distributions/:id/messages/read", { distributionId });
    await delay(120);
    const thread = mockThreadList.find((t) => t.distribution_id === distributionId);
    if (thread) thread.unread_count = 0;
  },

  toggleFavorite: async (distributionId: string): Promise<{ is_favorite: boolean }> => {
    console.log("[mock] POST /enquiry-distributions/:id/messages/favorite", { distributionId });
    await delay(120);
    if (favorites.delete(distributionId)) return { is_favorite: false };
    favorites.add(distributionId);
    return { is_favorite: true };
  },

  listStarred: async (): Promise<{ messages: StarredMessage[] }> => {
    console.log("[mock] GET /enquiry-distributions/messages/starred");
    await delay(200);
    const out: StarredMessage[] = [];
    for (const [distributionId, list] of mockThreads.entries()) {
      const summary = mockThreadList.find((t) => t.distribution_id === distributionId);
      for (const m of list) {
        if (!starredIds.has(m.id) || !summary) continue;
        out.push({
          ...m,
          is_starred: true,
          distribution_id: distributionId,
          counterpart_name: summary.counterpart_name,
          course_name: summary.course_name,
        });
      }
    }
    return { messages: out };
  },

  toggleStar: async (messageId: number): Promise<{ is_starred: boolean }> => {
    console.log("[mock] POST /enquiry-distributions/messages/stars/:messageId", { messageId });
    await delay(120);
    if (starredIds.delete(messageId)) return { is_starred: false };
    starredIds.add(messageId);
    return { is_starred: true };
  },

  togglePin: async (messageId: number): Promise<{ is_pinned: boolean }> => {
    console.log("[mock] POST /enquiry-distributions/messages/pins/:messageId", { messageId });
    await delay(120);
    if (pinnedIds.delete(messageId)) return { is_pinned: false };
    pinnedIds.add(messageId);
    return { is_pinned: true };
  },

  editMessage: async (messageId: number, body: string): Promise<EnquiryMessage> => {
    console.log("[mock] PATCH /enquiry-distributions/messages/:messageId", { messageId, body });
    await delay(200);
    for (const list of mockThreads.values()) {
      const found = list.find((m) => m.id === messageId);
      if (found) {
        found.body = body;
        found.edited_at = new Date().toISOString();
        return found;
      }
    }
    throw new Error("Message not found");
  },

  deleteMessage: async (messageId: number): Promise<void> => {
    console.log("[mock] DELETE /enquiry-distributions/messages/:messageId", { messageId });
    await delay(200);
    for (const [id, list] of mockThreads.entries()) {
      mockThreads.set(
        id,
        list.filter((m) => m.id !== messageId),
      );
    }
  },

  toggleReaction: async (messageId: number, emoji: string): Promise<{ reacted: boolean }> => {
    console.log("[mock] POST /enquiry-distributions/messages/reactions/:messageId", { messageId, emoji });
    await delay(120);
    const set = mockReactions.get(messageId) ?? new Set<string>();
    const reacted = !set.delete(emoji);
    if (reacted) set.add(emoji);
    mockReactions.set(messageId, set);
    return { reacted };
  },

  listReplies: async (messageId: number): Promise<{ messages: EnquiryMessage[] }> => {
    console.log("[mock] GET /enquiry-distributions/messages/threads/:messageId", { messageId });
    await delay(200);
    return { messages: mockReplies.get(messageId) ?? [] };
  },

  sendReply: async (messageId: number, body: string, attachments: string[] = []): Promise<EnquiryMessage> => {
    console.log("[mock] POST /enquiry-distributions/messages/threads/:messageId", { messageId, body, attachments });
    await delay(250);
    const reply = message({
      id: ++mockNextId,
      body,
      created_at: new Date().toISOString(),
      reply_to_id: messageId,
      attachments: attachments.map((p) => mockUploads.get(p)).filter((a): a is MessageAttachment => !!a),
    });
    mockReplies.set(messageId, [...(mockReplies.get(messageId) ?? []), reply]);
    // Keep the parent's "N replies" link honest in the mock too.
    const parent = threadOf(messageId)?.[1].find((m) => m.id === messageId);
    if (parent) parent.reply_count += 1;
    return reply;
  },
};
