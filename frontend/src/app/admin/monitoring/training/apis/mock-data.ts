import type { TrainingProgram } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const mockPrograms: TrainingProgram[] = [
  { id: 1, name: "IELTS Prep Bootcamp", provider: "Global Study Institute", updated: "2 weeks ago", status: "Published" },
  { id: 2, name: "Pre-departure Orientation", provider: "Globaly Team", updated: "yesterday", status: "Draft" },
];

export const trainingMockApi = {
  getPrograms: async (): Promise<TrainingProgram[]> => {
    console.log("[mock] GET /admin/training");
    await delay(300);
    return mockPrograms;
  },
};
