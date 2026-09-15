import { httpGet, httpPost } from "@/lib/api/http";
import type { InviteAdminParams, ListParams, PaginatedInvitations, PaginatedWaitlist, WaitlistParams } from "./types";

function toQuery(params: WaitlistParams): string {
  const search = new URLSearchParams();
  if (params.page) search.set("page", String(params.page));
  if (params.limit) search.set("limit", String(params.limit));
  if (params.search) search.set("search", params.search);
  if (params.registrant_type) search.set("registrant_type", params.registrant_type);
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export const usersRealApi = {
  listInvitations: (params: ListParams = {}): Promise<PaginatedInvitations> =>
    httpGet(`/admin/users/invitations${toQuery(params)}`),

  inviteAdmin: (params: InviteAdminParams): Promise<void> => httpPost("/admin/users/invite", params),

  resendInvitation: (id: string): Promise<void> => httpPost(`/admin/users/invitations/${id}/resend`, {}),

  // Coming-soon sign-ups (public.waitlist_registrations) — read-only.
  listWaitlist: (params: WaitlistParams = {}): Promise<PaginatedWaitlist> =>
    httpGet(`/admin/platform/waitlist${toQuery(params)}`),
};
