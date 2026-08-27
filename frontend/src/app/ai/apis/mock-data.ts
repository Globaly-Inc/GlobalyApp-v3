import type { AttachmentUpload, ChatSession, CourseCard, CreditBalance, GuestSSEEvent, Message, SendMessageInput, SSEEvent } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let nextSessionId = 3;
let nextMessageId = 100;

const mockSessions: ChatSession[] = [
  {
    id: 1,
    title: "MBA programs in Australia",
    is_archived: false,
    created_at: new Date(Date.now() - 3600 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 3600 * 1000).toISOString(),
  },
  {
    id: 2,
    title: "Scholarship options in Canada",
    is_archived: false,
    created_at: new Date(Date.now() - 86400 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 86400 * 1000).toISOString(),
  },
];

const mockMessages: Record<number, Message[]> = {
  1: [
    {
      id: 1,
      session_id: 1,
      role: "user",
      content: "What MBA programs are available in Melbourne?",
      cards: [],
      chips: [],
      blocks: [],
      feedback: null,
      created_at: new Date(Date.now() - 3600 * 1000).toISOString(),
    },
    {
      id: 2,
      session_id: 1,
      role: "assistant",
      content:
        "Here are some top MBA programs in Melbourne. These programs offer flexible study options and strong industry connections.",
      cards: [
        {
          institution_name: "University of Melbourne",
          institution_logo_url: "https://logo.clearbit.com/unimelb.edu.au",
          course_name: "Master of Business Administration",
          degree_level: "Postgraduate",
          duration: "2 years full-time",
          annual_tuition_fee: 52000,
          currency: "AUD",
          country: "Australia",
          city: "Melbourne",
          intakes: ["February", "July"],
          study_modes: ["On-campus", "Hybrid"],
          source_url: "https://example.com/unimelb-mba",
        },
      ],
      chips: ["Compare with Sydney MBA", "Scholarship options?", "What are the entry requirements?"],
      blocks: [
        {
          type: "comparison",
          title: "Melbourne MBA options",
          columns: ["Uni of Melbourne", "Monash"],
          rows: [
            { label: "Duration", values: ["2 years", "18 months"] },
            { label: "Annual fee", values: ["AUD 52,000", "AUD 49,500"] },
          ],
        },
      ],
      feedback: null,
      created_at: new Date(Date.now() - 3500 * 1000).toISOString(),
    },
  ],
  2: [],
};

const mockStreamCards: CourseCard[] = [
  {
    institution_name: "Monash University",
    institution_logo_url: "https://logo.clearbit.com/monash.edu",
    course_name: "Master of Business Administration",
    degree_level: "Postgraduate",
    duration: "18 months full-time",
    annual_tuition_fee: 49500,
    currency: "AUD",
    country: "Australia",
    city: "Melbourne",
    intakes: ["March", "October"],
    study_modes: ["On-campus"],
    source_url: "https://example.com/monash-mba",
  },
  {
    // No logo — exercises the monogram fallback.
    institution_name: "RMIT University",
    institution_logo_url: null,
    course_name: "Master of Business Administration (Executive)",
    degree_level: "Postgraduate",
    duration: "2 years part-time",
    annual_tuition_fee: 44000,
    currency: "AUD",
    country: "Australia",
    city: "Melbourne",
    intakes: ["February", "July"],
    study_modes: ["Hybrid", "Online"],
    source_url: "https://example.com/rmit-emba",
  },
];

export const aiMockApi = {
  listSessions: async (): Promise<ChatSession[]> => {
    console.log("[mock] GET /ai/sessions");
    await delay(300);
    return [...mockSessions];
  },

  deleteSession: async (sessionId: number): Promise<void> => {
    console.log("[mock] PATCH /ai/sessions/:id { delete: true }", sessionId);
    await delay(200);
    const idx = mockSessions.findIndex((s) => s.id === sessionId);
    if (idx !== -1) mockSessions.splice(idx, 1);
  },

  getMessages: async (sessionId: number): Promise<Message[]> => {
    console.log("[mock] GET /ai/sessions/:id/messages", sessionId);
    await delay(200);
    return mockMessages[sessionId] ?? [];
  },

  updateSession: async (sessionId: number, data: { title?: string; is_archived?: boolean }): Promise<ChatSession> => {
    console.log("[mock] PATCH /ai/sessions/:id", sessionId, data);
    await delay(200);
    const session = mockSessions.find((s) => s.id === sessionId);
    if (!session) throw new Error("Session not found");
    if (data.title !== undefined) session.title = data.title;
    if (data.is_archived !== undefined) session.is_archived = data.is_archived;
    return { ...session };
  },

  setFeedback: async (messageId: number, feedback: "up" | "down" | null): Promise<void> => {
    console.log("[mock] PATCH /ai/messages/:id/feedback", messageId, feedback);
    await delay(100);
  },

  uploadAttachment: async (file: File): Promise<AttachmentUpload> => {
    console.log("[mock] POST /ai-chat/attachments", file.name);
    await delay(400);
    return {
      storage_path: `ai-chat/1/attachments/${file.name}`,
      filename: file.name,
      mime_type: file.type,
      size: file.size,
    };
  },

  getCreditBalance: async (): Promise<CreditBalance> => {
    console.log("[mock] GET /ai/credits/balance");
    await delay(200);
    return { free: 7, subscription: 0, purchased: 0, total: 7 };
  },

  sendGuestMessage: async (
    content: string,
    _fingerprint: string,
    onEvent: (event: GuestSSEEvent) => void,
    _signal?: AbortSignal,
  ): Promise<void> => {
    console.log("[mock] POST /ai-chat/guest/messages", { content });
    onEvent({ type: "guest-meta", replies_remaining: 0, fingerprint_hash: "mock-hash" });
    await delay(300);
    const words = "As a guest you can ask one question. Sign up for personalised advice and saved history!".split(" ");
    for (const word of words) {
      onEvent({ type: "delta", text: word + " " });
      await delay(50);
    }
  },

  sendMessage: async (
    input: SendMessageInput,
    onEvent: (event: SSEEvent) => void,
    _signal?: AbortSignal,
  ): Promise<void> => {
    console.log("[mock] POST /ai/chat (SSE)", input);

    // Simulate session creation for new chats
    if (!input.session_id) {
      const newSession: ChatSession = {
        id: nextSessionId++,
        title: input.content.slice(0, 50),
        is_archived: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockSessions.unshift(newSession);
      onEvent({ type: "session_created", session: newSession });
      await delay(100);
    }

    onEvent({ type: "trace", step: "Understanding your question..." });
    await delay(400);
    onEvent({ type: "trace", step: "Searching course database..." });
    await delay(500);

    const words = "Based on your query, I found several relevant programs. Here are some options that match your criteria well.".split(" ");
    for (const word of words) {
      onEvent({ type: "delta", text: word + " " });
      await delay(50);
    }

    await delay(200);
    onEvent({ type: "cards", cards: mockStreamCards });
    await delay(100);
    onEvent({
      type: "blocks",
      blocks: [
        {
          type: "timeline",
          title: "Path to an MBA career",
          steps: [
            { title: "Bachelor's degree", description: "Any discipline, strong GPA" },
            { title: "Work experience", description: "2-3 years preferred" },
            { title: "MBA", description: "18-24 months" },
            { title: "Management role" },
          ],
        },
        {
          type: "quick_replies",
          question: "What matters most to you?",
          options: [
            { label: "💰 Salary", value: "Salary matters most to me" },
            { label: "📚 Study cost", value: "Study cost matters most to me" },
            { label: "🌍 Migration", value: "Migration opportunities matter most to me" },
          ],
        },
      ],
    });
    await delay(100);
    onEvent({ type: "chips", chips: ["Tell me more", "Compare programs", "Admission requirements"] });
    await delay(50);
    onEvent({ type: "done", message_id: nextMessageId++ });
  },
};
