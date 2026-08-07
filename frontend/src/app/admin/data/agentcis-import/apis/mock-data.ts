import type { AgentcisImportBatch } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const mockBatches: AgentcisImportBatch[] = [
  { id: 1, batch: "AgentCIS_2026_08.csv", agents: "312", status: "Completed", date: "2026-08-01" },
  { id: 2, batch: "AgentCIS_2026_07.csv", agents: "298", status: "Completed", date: "2026-07-01" },
];

export const agentcisImportMockApi = {
  getBatches: async (): Promise<AgentcisImportBatch[]> => {
    console.log("[mock] GET /admin/data-extraction/agentcis-import");
    await delay(300);
    return mockBatches;
  },
};
