import type { ImportInstitutionPayload, ImportInstitutionResult, ImportJobStatus } from "./types";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const spreadsheetImportMockApi = {
  checkNames: async (names: string[]): Promise<string[]> => {
    await delay(200);
    return names.filter((n) => n.toLowerCase().includes("existing"));
  },
  importInstitution: async (payload: ImportInstitutionPayload): Promise<ImportInstitutionResult> => {
    console.log("[mock] spreadsheet import", payload.institution.name, payload.rows.length);
    await delay(300);
    return { job_id: crypto.randomUUID() };
  },
  getJobStatus: async (jobId: string): Promise<ImportJobStatus> => {
    console.log("[mock] spreadsheet job status", jobId);
    await delay(300);
    return { status: "done", error: null };
  },
};
