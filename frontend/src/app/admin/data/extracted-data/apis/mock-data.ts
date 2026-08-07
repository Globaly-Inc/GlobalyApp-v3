import type { ExtractedInstitution } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const mockExtracted: ExtractedInstitution[] = [
  { id: 1, institution: "Sheridan College", status: "Approved", courses: "96", verification: "94%" },
  { id: 2, institution: "Torrens University", status: "Exported", courses: "140", verification: "89%" },
];

export const extractedDataMockApi = {
  getExtracted: async (): Promise<ExtractedInstitution[]> => {
    console.log("[mock] GET /admin/data-extraction/jobs-filtered?status=review,verified,approved,exported");
    await delay(300);
    return mockExtracted;
  },
};
