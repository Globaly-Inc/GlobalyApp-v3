import type { EnquiryMessage, MessageThreadSummary } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const mockThreadList: MessageThreadSummary[] = [
  {
    distribution_id: "dist-mock-1",
    enquiry_id: "enq-2",
    business_name: "Sydney Study Agents",
    logo_url: null,
    course_name: "Mock Bachelor of Computer Science",
    is_closed: false,
    unlocked_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    last_message_at: new Date(Date.now() - 3600_000).toISOString(),
  },
  {
    distribution_id: "dist-mock-2",
    enquiry_id: "enq-2",
    business_name: "Parramatta Education",
    logo_url: null,
    course_name: "Mock Bachelor of Computer Science",
    is_closed: true,
    unlocked_at: new Date(Date.now() - 86400000).toISOString(),
    last_message_at: null,
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
      },
    ],
  ],
]);

export const messagesMockApi = {
  listThreads: async (): Promise<{ threads: MessageThreadSummary[] }> => {
    console.log("[mock] GET /enquiry-messages");
    await delay(200);
    return { threads: mockThreadList };
  },

  getMessages: async (distributionId: string): Promise<{ messages: EnquiryMessage[] }> => {
    console.log("[mock] GET /enquiry-messages/:id", { distributionId });
    await delay(200);
    return { messages: mockThreads.get(distributionId) ?? [] };
  },

  sendMessage: async (distributionId: string, body: string): Promise<EnquiryMessage> => {
    console.log("[mock] POST /enquiry-messages/:id", { distributionId, body });
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
    };
    mockThreads.set(distributionId, [...thread, message]);
    return message;
  },
};
