import { createApi } from "@/lib/api/create-api";
import { trainingMockApi } from "./mock-data";
import { trainingRealApi } from "./real-api";

export const trainingApi = createApi({ mock: trainingMockApi, real: trainingRealApi });

export type {
  AdminTrainingProgram,
  AdminTrainingStats,
  ListTrainingProgramsParams,
  TrainingAudience,
} from "./types";
