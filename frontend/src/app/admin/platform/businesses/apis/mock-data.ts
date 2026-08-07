import type { BusinessSummary } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const mockBusinesses: BusinessSummary[] = [
  { id: 1, name: "Prime Education Group", subdomain: "primeedu", type: "Education Agent", status: "Active" },
  { id: 2, name: "Everest Migration Consultants", subdomain: "everest-migration", type: "Immigration Department", status: "Pending" },
  { id: 3, name: "Global Study Institute", subdomain: "gsi", type: "Institution", status: "Active" },
];

export const businessesMockApi = {
  getBusinesses: async (): Promise<BusinessSummary[]> => {
    console.log("[mock] GET /admin/businesses");
    await delay(300);
    return mockBusinesses;
  },
};
