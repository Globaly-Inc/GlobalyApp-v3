import { createApi } from "@/lib/api/create-api";
import { inviteMockApi } from "./mock-data";
import { inviteRealApi } from "./real-api";

export const inviteApi = createApi({ mock: inviteMockApi, real: inviteRealApi });
export type { AcceptAgentInviteParams, AcceptAgentInviteResult, AcceptBusinessClaimResult } from "./types";
