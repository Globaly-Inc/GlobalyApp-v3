import { createApi } from "@/lib/api/create-api";
import { spreadsheetImportMockApi } from "./mock-data";
import { spreadsheetImportRealApi } from "./real-api";

export const spreadsheetImportApi = createApi({ mock: spreadsheetImportMockApi, real: spreadsheetImportRealApi });
export type { ImportInstitutionPayload, ImportInstitutionResult, ImportJobStatus } from "./types";
