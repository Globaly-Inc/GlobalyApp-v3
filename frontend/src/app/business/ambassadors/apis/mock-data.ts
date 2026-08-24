import type { Application, CreateProgramInput, Program, ReviewResult, UpdateProgramInput } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let nextProgramId = 2;
let mockPrograms: Program[] = [
  {
    id: 1,
    business_id: 1,
    name: "Campus Ambassador Program",
    description: "Students refer peers to our courses for a per-signup commission.",
    commission_type: "flat",
    commission_value: "25.00",
    currency: "USD",
    status: "active",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

let nextApplicationId = 3;
const mockApplications: Record<number, Application[]> = {
  1: [
    {
      id: 1,
      program_id: 1,
      applicant_user_id: 101,
      applicant_name: "Priya Sharma",
      applicant_email: "priya.sharma@example.com",
      status: "pending",
      note: "Active in three international student WhatsApp groups.",
      reviewed_by: null,
      reviewed_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 2,
      program_id: 1,
      applicant_user_id: 102,
      applicant_name: "Daniel Okafor",
      applicant_email: "daniel.okafor@example.com",
      status: "approved",
      note: null,
      reviewed_by: 1,
      reviewed_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ],
};

export const businessAmbassadorsMockApi = {
  listPrograms: async (): Promise<Program[]> => {
    console.log("[mock] GET /ambassadors/programs");
    await delay(150);
    return mockPrograms;
  },

  createProgram: async (input: CreateProgramInput): Promise<Program> => {
    console.log("[mock] POST /ambassadors/programs", input);
    await delay(200);
    const program: Program = {
      id: nextProgramId++,
      business_id: 1,
      name: input.name,
      description: input.description ?? null,
      commission_type: input.commission_type,
      commission_value: input.commission_value.toFixed(2),
      currency: input.currency,
      status: "draft",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    mockPrograms = [program, ...mockPrograms];
    mockApplications[program.id] = [];
    return program;
  },

  updateProgram: async (programId: number, input: UpdateProgramInput): Promise<Program> => {
    console.log("[mock] PATCH /ambassadors/programs/:id", { programId, input });
    await delay(150);
    const existing = mockPrograms.find((p) => p.id === programId);
    if (!existing) throw new Error("Ambassador program not found");
    const updated: Program = {
      ...existing,
      ...input,
      commission_value: input.commission_value != null ? input.commission_value.toFixed(2) : existing.commission_value,
      updated_at: new Date().toISOString(),
    };
    mockPrograms = mockPrograms.map((p) => (p.id === programId ? updated : p));
    return updated;
  },

  listApplications: async (programId: number): Promise<Application[]> => {
    console.log("[mock] GET /ambassadors/programs/:id/applications", { programId });
    await delay(150);
    return mockApplications[programId] ?? [];
  },

  reviewApplication: async (
    programId: number,
    applicationId: number,
    decision: "approved" | "rejected",
  ): Promise<ReviewResult> => {
    console.log("[mock] POST .../applications/:id/review", { programId, applicationId, decision });
    await delay(250);
    const list = mockApplications[programId] ?? [];
    const target = list.find((a) => a.id === applicationId);
    if (!target) throw new Error("Application not found");
    if (target.status !== "pending") throw new Error(`This application is already ${target.status}`);

    const updated: Application = { ...target, status: decision, reviewed_at: new Date().toISOString(), reviewed_by: 1 };
    mockApplications[programId] = list.map((a) => (a.id === applicationId ? updated : a));

    return {
      application: updated,
      ambassador:
        decision === "approved"
          ? {
              id: nextApplicationId++,
              program_id: programId,
              user_id: target.applicant_user_id,
              application_id: applicationId,
              referral_code: Math.random().toString(36).slice(2, 12).toUpperCase(),
              status: "active",
              connect_onboarding_status: "not_started",
            }
          : null,
    };
  },
};
