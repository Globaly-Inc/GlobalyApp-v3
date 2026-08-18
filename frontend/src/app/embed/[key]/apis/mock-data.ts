import type { EmbedChatEvent, EmbedPublicConfig, GuestMessageRequest } from "./types";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const embedMockApi = {
  resolveConfig: async (key: string): Promise<EmbedPublicConfig> => {
    console.log("[mock] GET /embed/resolve", key);
    await delay(300);
    return { display_name: "Acme University", logo_url: null, brand_color: "#4f46e5" };
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
          degree_level: "Masters",
          duration: "104 weeks",
          annual_tuition_fee: 42000,
          currency: "AUD",
          country: "Australia",
          intakes: ["Feb", "Jul"],
          study_modes: ["On campus"],
          source_url: null,
        },
      ],
    });
    onEvent({ type: "chips", chips: ["What are the entry requirements?", "When is the next intake?"] });
    onEvent({ type: "done" });
  },
};
