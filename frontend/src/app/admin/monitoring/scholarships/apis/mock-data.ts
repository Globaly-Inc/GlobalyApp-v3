import type { Scholarship } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const mockScholarships: Scholarship[] = [
  { id: 1, name: "Vice-Chancellor's Excellence Scholarship", deadline: "2026-10-31", featured: "Yes", status: "Published" },
  { id: 2, name: "Global Leaders Award", deadline: "2026-11-15", featured: "No", status: "Draft" },
];

export const scholarshipsMockApi = {
  getScholarships: async (): Promise<Scholarship[]> => {
    console.log("[mock] GET /admin/scholarships");
    await delay(300);
    return mockScholarships;
  },
};
