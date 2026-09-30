import { createApi } from "@/lib/api/create-api";
import { businessInvitesMockApi } from "./mock-data";
import { businessInvitesRealApi } from "./real-api";

export const businessInvitesApi = createApi({ mock: businessInvitesMockApi, real: businessInvitesRealApi });
export type { InviteListParams, InviteStatus, OnboardingInvite } from "./types";
