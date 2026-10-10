import { httpDelete, httpGet, httpPost } from "@/lib/api/http";
import type {
  InviteListParams, InvitePreview, InvitePreviewParams, PaginatedInvites, ResendInviteResult, SendInviteParams, SendInviteResult,
} from "./types";

const BASE = "/admin/platform/onboarding-invitations";

function toQuery(params: InviteListParams): string {
  const search = new URLSearchParams();
  if (params.page) search.set("page", String(params.page));
  if (params.limit) search.set("limit", String(params.limit));
  if (params.status) search.set("status", params.status);
  if (params.search) search.set("search", params.search);
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export const businessInvitesRealApi = {
  listInvites: (params: InviteListParams = {}): Promise<PaginatedInvites> => httpGet(`${BASE}${toQuery(params)}`),
  sendInvite: (params: SendInviteParams): Promise<SendInviteResult> => httpPost(BASE, params),
  /** The mail itself, composed by the sender's own code. Read-only: no invite row, no token. */
  previewInvite: ({ business_category_id, name }: InvitePreviewParams): Promise<InvitePreview> => {
    const query = new URLSearchParams({ business_category_id: String(business_category_id) });
    if (name) query.set("name", name);
    return httpGet(`${BASE}/preview?${query}`);
  },
  /** `ifRequested`: only if the invitee's new-link request is still open (409 once resent). */
  resendInvite: (id: string, opts: { ifRequested?: boolean } = {}): Promise<ResendInviteResult> =>
    httpPost(`${BASE}/${id}/resend`, opts.ifRequested ? { if_requested: true } : {}),
  revokeInvite: (id: string): Promise<void> => httpDelete(`${BASE}/${id}`),
  deleteInvite: (id: string): Promise<void> => httpDelete(`${BASE}/${id}/permanent`),
};
