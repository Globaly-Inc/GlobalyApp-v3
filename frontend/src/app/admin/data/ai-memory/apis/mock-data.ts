import type { Lesson } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const mockLessons: Lesson[] = [
  { id: "l1", scope: "global", domain: null, step: "extraction", rule: "Always extract the full course name including degree prefix (e.g. 'Bachelor of' not just 'Computer Science').", example_bad: "Computer Science", example_good: "Bachelor of Computer Science", source: "manual", weight: 1.0, is_active: true, created_at: "2026-07-15T10:00:00Z" },
  { id: "l2", scope: "domain", domain: "sheridancollege.ca", step: "fees", rule: "Sheridan lists domestic fees per semester — multiply by 2 for annual total.", example_bad: null, example_good: null, source: "auto", weight: 0.8, is_active: true, created_at: "2026-07-20T08:00:00Z" },
  { id: "l3", scope: "global", domain: null, step: "intakes", rule: "If a page says 'applications open year-round', create a single intake with intake_name = 'Rolling'.", example_bad: null, example_good: "Rolling", source: "manual", weight: 0.9, is_active: false, created_at: "2026-07-22T14:00:00Z" },
  { id: "l4", scope: "domain", domain: "rmit.edu.au", step: "extraction", rule: "RMIT nests course pages under /programs/ not /courses/ — follow that URL pattern.", example_bad: null, example_good: null, source: "auto", weight: 0.7, is_active: true, created_at: "2026-08-01T09:00:00Z" },
];

export const aiMemoryMockApi = {
  getLessons: async (): Promise<Lesson[]> => {
    console.log("[mock] GET /admin/data-extraction/lessons?limit=100");
    await delay(300);
    return mockLessons;
  },

  toggleLesson: async (id: string, isActive: boolean): Promise<void> => {
    console.log("[mock] PATCH /admin/data-extraction/lessons/" + id, { is_active: isActive });
    await delay(200);
  },

  deleteLesson: async (id: string): Promise<void> => {
    console.log("[mock] DELETE /admin/data-extraction/lessons/" + id);
    await delay(200);
  },
};
