import { httpGet, httpPatch, httpPost } from "@/lib/api/http";
import type { AdminUser, InviteAdminParams, ListAdminsParams, PaginatedAdmins } from "./types";

function toQuery(params: ListAdminsParams): string {
  const search = new URLSearchParams();
  if (params.page) search.set("page", String(params.page));
  if (params.limit) search.set("limit", String(params.limit));
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export const usersRealApi = {
  listAdmins: (params: ListAdminsParams = {}): Promise<PaginatedAdmins> => httpGet(`/admin/users${toQuery(params)}`),

  inviteAdmin: (params: InviteAdminParams): Promise<void> => httpPost("/admin/users/invite", params),

  updateAdmin: (id: number, patch: Partial<Pick<AdminUser, "name" | "role" | "account_status" | "photo_url">>): Promise<AdminUser> =>
    httpPatch(`/admin/users/${id}`, patch),
};
