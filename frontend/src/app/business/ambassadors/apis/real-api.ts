import { httpGet, httpPatch, httpPost } from "@/lib/api/http";
import type { Application, CreateProgramInput, Program, ReviewResult, UpdateProgramInput } from "./types";

export const businessAmbassadorsRealApi = {
  listPrograms: (): Promise<Program[]> => httpGet("/ambassadors/programs"),

  createProgram: (input: CreateProgramInput): Promise<Program> => httpPost("/ambassadors/programs", input),

  updateProgram: (programId: number, input: UpdateProgramInput): Promise<Program> =>
    httpPatch(`/ambassadors/programs/${programId}`, input),

  listApplications: (programId: number): Promise<Application[]> =>
    httpGet(`/ambassadors/programs/${programId}/applications`),

  reviewApplication: (
    programId: number,
    applicationId: number,
    decision: "approved" | "rejected",
  ): Promise<ReviewResult> =>
    httpPost(`/ambassadors/programs/${programId}/applications/${applicationId}/review`, { decision }),
};
