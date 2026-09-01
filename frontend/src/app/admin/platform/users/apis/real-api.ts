import { httpGet, httpPost } from "@/lib/api/http";
import type { InviteAdminParams, ListParams, PaginatedInvitations } from "./types";

function toQuery(params: ListParams): string {
  const search = new URLSearchParams();
  if (params.page) search.set("page", String(params.page));
  if (params.limit) search.set("limit", String(params.limit));
  if (params.search) search.set("search", params.search);
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export const usersRealApi = {
  listInvitations: (params: ListParams = {}): Promise<PaginatedInvitations> =>
    httpGet(`/admin/users/invitations${toQuery(params)}`),

  inviteAdmin: (params: InviteAdminParams): Promise<void> => httpPost("/admin/users/invite", params),

  resendInvitation: (id: string): Promise<void> => httpPost(`/admin/users/invitations/${id}/resend`, {}),
};
