import { httpPost } from "@/lib/api/http";
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

export const inviteRealApi = {
  acceptAgentInvite: ({ token, org_id }: AcceptAgentInviteParams): Promise<AcceptAgentInviteResult> =>
    httpPost("/agents/invite/accept", { token, org_id }),
  acceptBusinessClaim: (params: AcceptClaimParams): Promise<AcceptBusinessClaimResult> =>
    httpPost("/businesses/claim/accept", params),
  // Same payload, same flow — only the table differs.
  acceptInstitutionClaim: (params: AcceptClaimParams): Promise<AcceptInstitutionClaimResult> =>
    httpPost("/institutions/claim/accept", params),
  acceptInstitutionMemberInvite: ({ token, org_id }: AcceptAgentInviteParams): Promise<AcceptInstitutionMemberInviteResult> =>
    httpPost("/institutions/members/invite/accept", { token, org_id }),
  acceptOnboardingInvite: (params: AcceptOnboardingInviteParams): Promise<AcceptOnboardingInviteResult> =>
    httpPost("/onboarding-invitations/accept", params),
  requestOnboardingLink: (params: AcceptOnboardingInviteParams): Promise<{ requested: true }> =>
    httpPost("/onboarding-invitations/request-link", params),
};
