import { httpGet, httpPost } from "@/lib/api/http";
import { toAdminUser, type AdminMeWire } from "../../../apis/real-api";
import type {
  InviteAdminParams, ListParams, PaginatedAdminUsers, PaginatedInvitations,
} from "./types";

function toQuery(params: ListParams): string {
  const search = new URLSearchParams();
  if (params.page) search.set("page", String(params.page));
  if (params.limit) search.set("limit", String(params.limit));
  if (params.search) search.set("search", params.search);
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export const usersRealApi = {
  listUsers: async (params: ListParams = {}): Promise<PaginatedAdminUsers> => {
    const result = await httpGet<{ data: AdminMeWire[]; meta: PaginatedAdminUsers["meta"] }>(
      `/admin/users${toQuery(params)}`,
    );
    return { ...result, data: result.data.map(toAdminUser) };
  },

  listInvitations: (params: ListParams = {}): Promise<PaginatedInvitations> =>
    httpGet(`/admin/users/invitations${toQuery(params)}`),

  inviteAdmin: (params: InviteAdminParams): Promise<void> => httpPost("/admin/users/invite", params),
};
