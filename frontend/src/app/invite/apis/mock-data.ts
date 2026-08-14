import type { AcceptAgentInviteParams, AcceptAgentInviteResult } from "./types";

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
};
