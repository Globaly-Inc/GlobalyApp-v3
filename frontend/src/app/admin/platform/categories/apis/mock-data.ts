import type { CategoriesByTab } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const mockCategories: CategoriesByTab = {
  business: [
    { id: 1, name: "Education Agent", slug: "education-agent", count: "128" },
    { id: 2, name: "Institution", slug: "institution", count: "64" },
    { id: 3, name: "Immigration Department", slug: "immigration-department", count: "19" },
  ],
  service: [
    { id: 1, name: "Bachelor Degree", slug: "bachelor-degree", count: "412" },
    { id: 2, name: "Language Test Prep", slug: "language-test-prep", count: "58" },
  ],
  degree_levels: [
    { id: 1, name: "Foundation", sort: "1" },
    { id: 2, name: "Bachelor", sort: "2" },
    { id: 3, name: "Master", sort: "3" },
    { id: 4, name: "PhD", sort: "4" },
  ],
  areas_of_study: [
    { id: 1, name: "Computer Science", parent: "Engineering & IT" },
    { id: 2, name: "Nursing", parent: "Health Sciences" },
  ],
  fee_types: [
    { id: 1, name: "Tuition Fee", code: "TUITION" },
    { id: 2, name: "Application Fee", code: "APPLICATION" },
  ],
  accreditations: [
    { id: 1, name: "TEQSA", country: "Australia" },
    { id: 2, name: "QAA", country: "United Kingdom" },
  ],
  search_module: [
    { id: 1, name: "Intake month", type: "select" },
    { id: 2, name: "Budget range", type: "range" },
  ],
};

export const categoriesMockApi = {
  getCategories: async (): Promise<CategoriesByTab> => {
    console.log("[mock] GET /admin/categories");
    await delay(300);
    return mockCategories;
  },
};
