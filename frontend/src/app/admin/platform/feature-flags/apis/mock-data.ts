import type { FeatureFlag } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let mockFlags: FeatureFlag[] = [
  { key: "formal-applications", label: "Formal application processing workflow", enabled: true },
  { key: "ambassador-recruitment", label: "Ambassador recruitment", enabled: true },
  { key: "ai-counselor", label: "AI counselor (personal portal)", enabled: true },
  { key: "credits-marketplace", label: "Credits marketplace", enabled: false },
  { key: "job-board", label: "Job board", enabled: false },
];

export const featureFlagsMockApi = {
  getFlags: async (): Promise<FeatureFlag[]> => {
    console.log("[mock] GET /admin/platform/feature-flags");
    await delay(300);
    return mockFlags;
  },

  toggleFlag: async (key: string, enabled: boolean): Promise<FeatureFlag> => {
    console.log("[mock] PATCH /admin/platform/feature-flags/" + key, { is_enabled: enabled });
    await delay(200);
    mockFlags = mockFlags.map((f) => (f.key === key ? { ...f, enabled } : f));
    return mockFlags.find((f) => f.key === key)!;
  },
};
