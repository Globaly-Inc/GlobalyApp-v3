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
  OnboardingInviteLookup,
  OnboardingInviteParams,
} from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MOCK_INVITE_EMAIL = "admissions@example.edu";
/** Mock mode mails nothing, so the code is fixed — type this one to get through the invited flow. */
const MOCK_INVITE_OTP = "492701";

/** The states a token can be in before any of the three onboarding calls can do their work. */
function throwIfTokenUnusable(token: string) {
  if (token === "expired") throw new ApiError("This invite link has expired.", "INVITE_EXPIRED");
  if (token === "revoked") throw new ApiError("This invite was revoked.", "INVITE_REVOKED");
  if (token === "used") throw new ApiError("This invite has already been used. Sign in instead.", "CONFLICT", { email: MOCK_INVITE_EMAIL });
  if (!token || token === "bad") throw new Error("This invite is no longer valid. Ask for a new one.");
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
  lookupOnboardingInvite: async (params: OnboardingInviteParams): Promise<OnboardingInviteLookup> => {
    console.log("[mock] POST /onboarding-invitations/lookup", params);
    await delay(400);
    throwIfTokenUnusable(params.token);
    return { email: MOCK_INVITE_EMAIL, org_name: "Northgate University", type: params.type };
  },
  sendOnboardingCode: async (params: OnboardingInviteParams): Promise<{ email: string }> => {
    console.log("[mock] POST /onboarding-invitations/send-code", params);
    await delay(500);
    throwIfTokenUnusable(params.token);
    return { email: MOCK_INVITE_EMAIL };
  },
  acceptOnboardingInvite: async (params: AcceptOnboardingInviteParams): Promise<AcceptOnboardingInviteResult> => {
    // The code is a bearer credential even in mock logs.
    console.log("[mock] POST /onboarding-invitations/accept", { token: params.token, type: params.type });
    await delay(800);
    throwIfTokenUnusable(params.token);
    if (params.otp !== MOCK_INVITE_OTP) throw new ApiError("Invalid OTP", "UNAUTHORIZED");
    return { email: MOCK_INVITE_EMAIL, type: params.type };
  },
  requestOnboardingLink: async (params: OnboardingInviteParams): Promise<{ requested: true }> => {
    console.log("[mock] POST /onboarding-invitations/request-link", params);
    await delay(500);
    return { requested: true };
  },
};
