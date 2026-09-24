import { httpGet, httpPatch } from "@/lib/api/http";
import type { ListParams, PaginatedPlatformUsers, PlatformUser, UpdatePlatformUserParams } from "./types";

function toQuery(params: ListParams): string {
  const search = new URLSearchParams();
  if (params.page) search.set("page", String(params.page));
  if (params.limit) search.set("limit", String(params.limit));
  if (params.search) search.set("search", params.search);
  if (params.type) search.set("type", params.type);
  if (params.admin) search.set("admin", "true");
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export const platformUsersRealApi = {
  listPlatformUsers: (params: ListParams = {}): Promise<PaginatedPlatformUsers> =>
    httpGet(`/admin/platform-users${toQuery(params)}`),

  updatePlatformUser: (id: number, patch: UpdatePlatformUserParams): Promise<PlatformUser> =>
    httpPatch(`/admin/platform-users/${id}`, patch),

  setPlatformUserAdminRole: (id: number, role: "super_admin" | "data_admin" | null): Promise<void> =>
    httpPatch(`/admin/platform-users/${id}/role`, { role }),
};
