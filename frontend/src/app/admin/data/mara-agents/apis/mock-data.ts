import type { MaraAgentSummary } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const mockAgents: MaraAgentSummary[] = [
  { id: 1, name: "Jane Wilkins", marn: "1234567", location: "Sydney, AU", status: "Pending" },
  { id: 2, name: "David Cho", marn: "7654321", location: "Melbourne, AU", status: "Approved" },
];

export const maraAgentsMockApi = {
  getAgents: async (): Promise<MaraAgentSummary[]> => {
    console.log("[mock] GET /admin/data-extraction/mara-agents");
    await delay(300);
    return mockAgents;
  },
};
