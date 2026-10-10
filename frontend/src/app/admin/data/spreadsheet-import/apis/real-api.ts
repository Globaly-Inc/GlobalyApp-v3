import { httpGet, httpPost } from "@/lib/api/http";
import type { GetJobsResult } from "../../all-extractions/apis/types";
import type { ImportInstitutionPayload, ImportInstitutionResult, ImportJobStatus, ListImportsParams } from "./types";

export const spreadsheetImportRealApi = {
  /** Which of these institution names already exist (extraction job or live institution). */
  checkNames: async (names: string[]): Promise<string[]> => {
    const { existing } = await httpPost<{ existing: string[] }>("/admin/data-extraction/spreadsheet/check-names", { names });
    return existing;
  },

  /** One institution per request — staged in the background by the spreadsheet worker. */
  importInstitution: (payload: ImportInstitutionPayload): Promise<ImportInstitutionResult> =>
    httpPost<ImportInstitutionResult>("/admin/data-extraction/spreadsheet/import", payload),

  /** Past spreadsheet imports, newest first, one page at a time. */
  listImports: (params: ListImportsParams): Promise<GetJobsResult> => {
    const query = new URLSearchParams({ source_type: "spreadsheet", sort: "newest", page: String(params.page), limit: String(params.limit) });
    if (params.q) query.set("q", params.q);
    if (params.statuses?.length) query.set("statuses", params.statuses.join(","));
    if (params.excludeStatuses?.length) query.set("exclude_statuses", params.excludeStatuses.join(","));
    return httpGet<GetJobsResult>(`/admin/data-extraction/jobs-filtered?${query}`);
  },

  /** The worker stages in the background; "done" / "failed" is when it has actually finished. */
  getJobStatus: async (jobId: string): Promise<ImportJobStatus> => {
    const { job } = await httpGet<{ job: { status: string; error_message: string | null } }>(`/admin/data-extraction/jobs/${jobId}`);
    return { status: job.status, error: job.error_message };
  },
};
