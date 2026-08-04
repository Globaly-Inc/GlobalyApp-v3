import type { Lead } from "./types";

const leads: Lead[] = [
  { id: "1", company: "Acme Corp", stage: "qualified" },
  { id: "2", company: "Globex", stage: "new" },
];

export const signupMockApi = {
  getLeads: async (): Promise<Lead[]> => leads,
};
