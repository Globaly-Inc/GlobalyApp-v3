import { httpGet, httpPost } from "@/lib/api/http";
import type { ImportInstitutionPayload, ImportInstitutionResult, ImportJobStatus } from "./types";

export const spreadsheetImportRealApi = {
  /** Which of these institution names already exist (extraction job or live institution). */
  checkNames: async (names: string[]): Promise<string[]> => {
    const { existing } = await httpPost<{ existing: string[] }>("/admin/data-extraction/spreadsheet/check-names", { names });
    return existing;
  },

  /** One institution per request — staged in the background by the spreadsheet worker. */
  importInstitution: (payload: ImportInstitutionPayload): Promise<ImportInstitutionResult> =>
    httpPost<ImportInstitutionResult>("/admin/data-extraction/spreadsheet/import", payload),

  /** The worker stages in the background; "done" / "failed" is when it has actually finished. */
  getJobStatus: async (jobId: string): Promise<ImportJobStatus> => {
    const { job } = await httpGet<{ job: { status: string; error_message: string | null } }>(`/admin/data-extraction/jobs/${jobId}`);
    return { status: job.status, error: job.error_message };
  },
};
