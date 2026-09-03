import { createApi } from "@/lib/api/create-api";
import { usersMockApi } from "./mock-data";
import { usersRealApi } from "./real-api";

export const usersApi = createApi({ mock: usersMockApi, real: usersRealApi });
export type { AdminRole, AdminInvitation, PaginatedInvitations, ListParams, InviteAdminParams } from "./types";
