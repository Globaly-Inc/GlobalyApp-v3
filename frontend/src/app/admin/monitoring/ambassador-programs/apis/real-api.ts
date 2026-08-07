import { httpGet } from "@/lib/api/http";
import type { AmbassadorProgram } from "./types";

export const ambassadorProgramsRealApi = {
  getPrograms: (): Promise<AmbassadorProgram[]> => httpGet("/admin/ambassador-programs"),
};
