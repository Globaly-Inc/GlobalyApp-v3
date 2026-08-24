import { createApi } from "@/lib/api/create-api";
import { businessAmbassadorsMockApi } from "./mock-data";
import { businessAmbassadorsRealApi } from "./real-api";

export const businessAmbassadorsApi = createApi({ mock: businessAmbassadorsMockApi, real: businessAmbassadorsRealApi });
export type {
  Ambassador, Application, ApplicationStatus, CommissionType, CreateProgramInput, Program, ProgramStatus,
  ReviewResult, UpdateProgramInput,
} from "./types";
