import { httpPost } from "@/lib/api/http";
import type { AcceptAgentInviteParams, AcceptAgentInviteResult } from "./types";

export const inviteRealApi = {
  acceptAgentInvite: ({ token, org_id }: AcceptAgentInviteParams): Promise<AcceptAgentInviteResult> =>
    httpPost("/agents/invite/accept", { token, org_id }),
};
