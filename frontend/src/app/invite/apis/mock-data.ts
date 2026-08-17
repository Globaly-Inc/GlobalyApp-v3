import type { AcceptAgentInviteParams, AcceptAgentInviteResult, AcceptBusinessClaimResult } from "./types";

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
  acceptBusinessClaim: async (token: string): Promise<AcceptBusinessClaimResult> => {
    console.log("[mock] POST /businesses/claim/accept", { token });
    await delay(500);
    if (!token) throw new Error("This claim link is invalid or has already been used.");
    return { email: "owner@example.com", business_name: "Mock Business" };
  },
};
