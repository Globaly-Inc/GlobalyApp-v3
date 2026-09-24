import { createApi } from "@/lib/api/create-api";
import { platformUsersMockApi } from "./mock-data";
import { platformUsersRealApi } from "./real-api";

export const platformUsersApi = createApi({ mock: platformUsersMockApi, real: platformUsersRealApi });
export type {
  PlatformUser, PaginatedPlatformUsers, ListParams, PlatformUserType, PlatformUserAdminRole, UpdatePlatformUserParams,
} from "./types";
