import type { FeatureFlag } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let mockFlags: FeatureFlag[] = [
  { id: "formal-applications", label: "Formal application processing workflow", enabled: true },
  { id: "ambassador-recruitment", label: "Ambassador recruitment", enabled: true },
  { id: "ai-counselor", label: "AI counselor (personal portal)", enabled: true },
  { id: "credits-marketplace", label: "Credits marketplace", enabled: false },
  { id: "job-board", label: "Job board", enabled: false },
];

export const featureFlagsMockApi = {
  getFlags: async (): Promise<FeatureFlag[]> => {
    console.log("[mock] GET /admin/feature-flags");
    await delay(300);
    return mockFlags;
  },

  toggleFlag: async (id: string, enabled: boolean): Promise<FeatureFlag> => {
    console.log("[mock] PATCH /admin/feature-flags/" + id, { enabled });
    await delay(200);
    mockFlags = mockFlags.map((f) => (f.id === id ? { ...f, enabled } : f));
    return mockFlags.find((f) => f.id === id)!;
  },
};
