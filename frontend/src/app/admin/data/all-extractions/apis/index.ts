import { createApi } from "@/lib/api/create-api";
import { allExtractionsMockApi } from "./mock-data";
import { allExtractionsRealApi } from "./real-api";

export const allExtractionsApi = createApi({ mock: allExtractionsMockApi, real: allExtractionsRealApi });
export type {
  ExtractionJob,
  ExtractionStatus,
  CreateJobParams,
  InstitutionOverview,
  CampusRow,
  AgentRow,
  CourseRow,
  CourseLinks,
  JobFull,
} from "./types";
