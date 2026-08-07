import type { VisaSummary } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const mockVisas: VisaSummary[] = [
  { id: 1, name: "Student Visa", subclass: "500", country: "Australia", status: "Pending" },
  { id: 2, name: "Skilled Independent Visa", subclass: "189", country: "Australia", status: "Approved" },
];

export const visasMockApi = {
  getVisas: async (): Promise<VisaSummary[]> => {
    console.log("[mock] GET /admin/data-extraction/visas");
    await delay(300);
    return mockVisas;
  },
};
