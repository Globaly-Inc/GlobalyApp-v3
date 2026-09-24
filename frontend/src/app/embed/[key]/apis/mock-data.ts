import type {
  EmbedChatEvent, EmbedPublicConfig, EmbedThread, GuestContactRequest,
  GuestConversationEndRequest, GuestConversationEndResponse, GuestMessageRequest,
  WireCourseCard,
} from "./types";
import type { CourseCard } from "@/app/ai/apis/types";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const embedMockApi = {
  getThread: async (key: string, fingerprint: string): Promise<EmbedThread> => {
    console.log("[mock] GET /guest/session", key, fingerprint);
    await delay(200);
    // A returning visitor mid-thread — the case the empty-panel bug hid.
    return {
      session_id: 1,
      messages: [
        { id: 1, role: "user", content: "Do you offer data science?", cards: [], chips: [], created_at: new Date().toISOString() },
        { id: 2, role: "assistant", content: "Yes — we run a Master of Data Science.", cards: [], chips: [], created_at: new Date().toISOString() },
      ],
    };
  },

  toCourseCards: (cards: WireCourseCard[]): CourseCard[] =>
    cards.map((c) => ({ ...c, course_name: c.name ?? "", institution_name: c.institution ?? "" }) as unknown as CourseCard),

  resolveConfig: async (key: string): Promise<EmbedPublicConfig> => {
    console.log("[mock] GET /embed/resolve", key);
    await delay(300);
    return { display_name: "Acme University", logo_url: null, brand_color: "#4f46e5", owner_kind: "institution" };
  },

  sendMessage: async (
    input: GuestMessageRequest,
    onEvent: (event: EmbedChatEvent) => void,
  ): Promise<void> => {
    console.log("[mock] POST /guest/messages (SSE)", input);
    await delay(400);
    onEvent({ type: "trace", step: "Searching Acme University courses..." });
    await delay(400);
    for (const word of "Here are two Acme University programs that match what you're looking for.".split(" ")) {
      onEvent({ type: "delta", text: `${word} ` });
      await delay(40);
    }
    onEvent({
      type: "cards",
      cards: [
        {
          course_name: "Master of Data Science",
          institution_name: "Acme University",
          institution_logo_url: null,
          institution_cover_url: null,
          degree_level: "Masters",
          duration: "104 weeks",
          annual_tuition_fee: 42000,
          currency: "AUD",
          country: "Australia",
          city: "Sydney",
          intakes: ["Feb", "Jul"],
          study_modes: ["On campus"],
          source_url: null,
        },
      ],
    });
    onEvent({ type: "chips", chips: ["What are the entry requirements?", "When is the next intake?"] });
    // Emitted on every mock turn so the card is reachable without counting to three —
    // the real threshold lives on the embed config and is decided server-side.
    onEvent({
      type: "contact-prompt",
      prompt: {
        heading: "Want a copy of this conversation?",
        body: "Share your name and email and we'll send you a summary of everything we've covered about Acme University — the programs, the details, and what to do next.",
      },
    });
    // Both offers on one mock turn — the real server shows at most one, but the mock exists to
    // make each card reachable without a live model deciding to signal.
    onEvent({
      type: "end-prompt",
      prompt: {
        heading: "Shall we wrap up here?",
        covered: "we've covered the Master of Data Science, its fees and the February intake",
        body: "I can email you a summary of everything we discussed, or we can keep going.",
        email: "visitor@example.com",
      },
    });
    onEvent({ type: "done" });
  },

  submitContact: async (input: GuestContactRequest): Promise<void> => {
    console.log("[mock] POST /guest/contact", input);
    await delay(400);
  },

  confirmConversationEnd: async (
    input: GuestConversationEndRequest,
  ): Promise<GuestConversationEndResponse> => {
    console.log("[mock] POST /guest/conversation-end", input);
    await delay(400);
    return { ok: true, summary_queued: input.action === "end" };
  },
};
