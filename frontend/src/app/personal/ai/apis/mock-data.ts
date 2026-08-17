import type { ChatSession, CourseCard, CreditBalance, Message, SendMessageInput, SSEEvent } from "./types";

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
          course_name: "Master of Business Administration",
          degree_level: "Postgraduate",
          duration: "2 years full-time",
          annual_tuition_fee: 52000,
          currency: "AUD",
          country: "Australia",
          intakes: ["February", "July"],
          study_modes: ["On-campus", "Hybrid"],
          source_url: "https://example.com/unimelb-mba",
        },
      ],
      chips: ["Compare with Sydney MBA", "Scholarship options?", "What are the entry requirements?"],
      feedback: null,
      created_at: new Date(Date.now() - 3500 * 1000).toISOString(),
    },
  ],
  2: [],
};

const mockStreamCards: CourseCard[] = [
  {
    institution_name: "Monash University",
    course_name: "Master of Business Administration",
    degree_level: "Postgraduate",
    duration: "18 months full-time",
    annual_tuition_fee: 49500,
    currency: "AUD",
    country: "Australia",
    intakes: ["March", "October"],
    study_modes: ["On-campus"],
    source_url: "https://example.com/monash-mba",
  },
];

export const aiMockApi = {
  listSessions: async (): Promise<ChatSession[]> => {
    console.log("[mock] GET /ai/sessions");
    await delay(300);
    return mockSessions.filter((s) => !s.is_archived);
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

  getCreditBalance: async (): Promise<CreditBalance> => {
    console.log("[mock] GET /ai/credits/balance");
    await delay(200);
    return { free: 7, subscription: 0, purchased: 0, total: 7 };
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
    onEvent({ type: "chips", chips: ["Tell me more", "Compare programs", "Admission requirements"] });
    await delay(50);
    onEvent({ type: "done", message_id: nextMessageId++ });
  },
};
