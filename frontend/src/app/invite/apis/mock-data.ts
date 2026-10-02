import { ApiError } from "@/lib/api/http";
import type {
  AcceptAgentInviteParams,
  AcceptAgentInviteResult,
  AcceptBusinessClaimResult,
  AcceptClaimParams,
  AcceptInstitutionClaimResult,
  AcceptInstitutionMemberInviteResult,
  AcceptOnboardingInviteParams,
  AcceptOnboardingInviteResult,
} from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const inviteMockApi = {
  acceptAgentInvite: async ({ token, org_id }: AcceptAgentInviteParams): Promise<AcceptAgentInviteResult> => {
    console.log("[mock] POST /agents/invite/accept", { token, org_id });
    await delay(500);
    if (!token || !org_id) throw new Error("Invitation not found or already used.");
    return { message: "Invitation accepted. Log in with your email to continue.", org_id, agent: { id: 1, role: "member" } };
  },
  acceptBusinessClaim: async (params: AcceptClaimParams): Promise<AcceptBusinessClaimResult> => {
    console.log("[mock] POST /businesses/claim/accept", params);
    await delay(500);
    if (!params.token) throw new Error("This claim link is invalid or has already been used.");
    return { email: "owner@example.com", business_name: "Mock Business" };
  },
  acceptInstitutionClaim: async (params: AcceptClaimParams): Promise<AcceptInstitutionClaimResult> => {
    console.log("[mock] POST /institutions/claim/accept", params);
    await delay(500);
    if (!params.token) throw new Error("This claim link is invalid or has already been used.");
    return { email: "owner@example.com", institution_name: "Mock Institution" };
  },
  acceptInstitutionMemberInvite: async ({ token, org_id }: AcceptAgentInviteParams): Promise<AcceptInstitutionMemberInviteResult> => {
    console.log("[mock] POST /institutions/members/invite/accept", { token, org_id });
    await delay(500);
    if (!token || !org_id) throw new Error("Invitation not found or already used.");
    return { message: "Invitation accepted. Log in with your email to access this institution.", org_id };
  },
  acceptOnboardingInvite: async (params: AcceptOnboardingInviteParams): Promise<AcceptOnboardingInviteResult> => {
    console.log("[mock] POST /onboarding-invitations/accept", params);
    await delay(800);
    if (params.token === "expired") throw new ApiError("This invite link has expired.", "INVITE_EXPIRED");
    if (params.token === "revoked") throw new ApiError("This invite was revoked.", "INVITE_REVOKED");
    if (params.token === "used") throw new ApiError("This invite has already been used. Sign in instead.", "CONFLICT", { email: "admissions@example.edu" });
    if (!params.token || params.token === "bad") throw new Error("This invite is no longer valid. Ask for a new one.");
    return { email: "admissions@example.edu", type: params.type };
  },
  requestOnboardingLink: async (params: AcceptOnboardingInviteParams): Promise<{ requested: true }> => {
    console.log("[mock] POST /onboarding-invitations/request-link", params);
    await delay(500);
    return { requested: true };
  },
};
