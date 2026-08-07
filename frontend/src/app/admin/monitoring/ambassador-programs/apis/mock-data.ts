import type { AmbassadorProgram } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const mockPrograms: AmbassadorProgram[] = [
  { id: 1, name: "Campus Ambassador 2026", business: "Global Study Institute", ambassadors: "34", status: "Active" },
  { id: 2, name: "Referral Champions", business: "Prime Education Group", ambassadors: "12", status: "Active" },
];

export const ambassadorProgramsMockApi = {
  getPrograms: async (): Promise<AmbassadorProgram[]> => {
    console.log("[mock] GET /admin/ambassador-programs");
    await delay(300);
    return mockPrograms;
  },
};
