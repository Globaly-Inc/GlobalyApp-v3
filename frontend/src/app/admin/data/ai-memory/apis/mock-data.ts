import type { SiteProfileSummary } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const mockProfiles: SiteProfileSummary[] = [
  { id: 1, domain: "unimelb.edu.au", corrections: "14", updated: "3 days ago" },
  { id: 2, domain: "sheridancollege.ca", corrections: "6", updated: "1 week ago" },
];

export const aiMemoryMockApi = {
  getSiteProfiles: async (): Promise<SiteProfileSummary[]> => {
    console.log("[mock] GET /admin/data-extraction/site-profiles");
    await delay(300);
    return mockProfiles;
  },
};
