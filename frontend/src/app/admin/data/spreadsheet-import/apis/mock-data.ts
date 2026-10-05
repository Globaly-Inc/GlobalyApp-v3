import type { GetJobsResult } from "../../all-extractions/apis/types";
import type { ImportInstitutionPayload, ImportInstitutionResult, ImportJobStatus, ListImportsParams } from "./types";

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
  listImports: async (params: ListImportsParams): Promise<GetJobsResult> => {
    await delay(200);
    return { jobs: [], meta: { page: params.page, limit: params.limit, total: 0, totalPages: 0 } };
  },
  getJobStatus: async (jobId: string): Promise<ImportJobStatus> => {
    console.log("[mock] spreadsheet job status", jobId);
    await delay(300);
    return { status: "review", error: null };
  },
};
