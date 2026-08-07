import type { ModerationFlag } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const mockFlags: ModerationFlag[] = [
  { id: 1, entity: "Everest Migration Consultants", type: "Business", reason: "Suspicious registration details", status: "Flagged" },
  { id: 2, entity: "Blog post — \"Fastest visa hacks\"", type: "Content", reason: "Reported by 4 users", status: "Suspended" },
];

export const moderationMockApi = {
  getFlags: async (): Promise<ModerationFlag[]> => {
    console.log("[mock] GET /admin/moderation");
    await delay(300);
    return mockFlags;
  },
};
