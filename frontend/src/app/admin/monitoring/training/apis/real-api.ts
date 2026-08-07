import { httpGet } from "@/lib/api/http";
import type { TrainingProgram } from "./types";

export const trainingRealApi = {
  getPrograms: (): Promise<TrainingProgram[]> => httpGet("/admin/training"),
};
