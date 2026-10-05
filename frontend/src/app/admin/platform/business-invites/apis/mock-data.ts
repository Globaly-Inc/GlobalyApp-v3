import { ApiError } from "@/lib/api/http";
import type { InviteListParams, OnboardingInvite, PaginatedInvites, ResendInviteResult, SendInviteParams, SendInviteResult } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const DAY = 86_400_000;
const at = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

let mockInvites: OnboardingInvite[] = [
  { id: "1", email: "admissions@oxford.ac.uk", org_name: "University of Oxford", type: "institution", status: "pending", expires_at: at(2 * DAY), business_category_id: 1, business_category_name: "Institutions", invited_by_name: "Aarav Sharma", accepted_institution_id: null, accepted_business_id: null, accepted_at: null, email_status: "sent", email_sent_at: at(-DAY), email_error: null, link_requested_at: null, created_at: at(-DAY) },
  { id: "2", email: "info@unimelb.edu.au", org_name: "University of Melbourne", type: "institution", status: "accepted", expires_at: at(DAY), business_category_id: 1, business_category_name: "Institutions", invited_by_name: "Aarav Sharma", accepted_institution_id: 42, accepted_business_id: null, accepted_at: at(-DAY / 2), email_status: "sent", email_sent_at: at(-2 * DAY), email_error: null, link_requested_at: null, created_at: at(-2 * DAY) },
  { id: "3", email: "hello@visahub.com.au", org_name: "Visa Hub", type: "business", status: "expired", expires_at: at(-DAY), business_category_id: 3, business_category_name: "Visa Services", invited_by_name: "Sita Rai", accepted_institution_id: null, accepted_business_id: null, accepted_at: null, email_status: "failed", email_sent_at: null, email_error: "Mailbox unavailable", link_requested_at: at(-DAY / 4), created_at: at(-4 * DAY) },
];

export const businessInvitesMockApi = {
  listInvites: async (params: InviteListParams = {}): Promise<PaginatedInvites> => {
    console.log("[mock] GET /admin/platform/onboarding-invitations", params);
    await delay(300);
    const page = params.page ?? 1;
    const limit = params.limit ?? 10;
    const q = params.search?.toLowerCase();
    const searched = mockInvites.filter((i) => !q || i.org_name.toLowerCase().includes(q) || i.email.toLowerCase().includes(q));
    const rows = params.status ? searched.filter((i) => i.status === params.status) : searched;
    const count = (s: OnboardingInvite["status"]) => searched.filter((i) => i.status === s).length;
    return {
      counts: { pending: count("pending"), accepted: count("accepted"), expired: count("expired"), revoked: count("revoked") },
      data: rows.slice((page - 1) * limit, page * limit),
      meta: { page, limit, total: rows.length, totalPages: Math.max(1, Math.ceil(rows.length / limit)) },
    };
  },
  sendInvite: async ({ email, name, business_category_id }: SendInviteParams): Promise<SendInviteResult> => {
    console.log("[mock] POST /admin/platform/onboarding-invitations", { email, name, business_category_id });
    const type = business_category_id === 1 ? "institution" : "business";
    await delay(500);
    if (mockInvites.some((i) => i.email === email && i.status === "pending")) {
      throw new ApiError("Already invited", "CONFLICT");
    }
    mockInvites = [
      { id: String(Date.now()) + email, email, org_name: name, type, status: "pending", expires_at: at(3 * DAY), business_category_id, business_category_name: null, invited_by_name: "Aarav Sharma", accepted_institution_id: null, accepted_business_id: null, accepted_at: null, email_status: "sent", email_sent_at: at(0), email_error: null, link_requested_at: null, created_at: at(0) },
      ...mockInvites,
    ];
    return { email, type, email_status: "sent" };
  },
  resendInvite: async (id: string, opts: { ifRequested?: boolean } = {}): Promise<ResendInviteResult> => {
    console.log("[mock] POST /admin/platform/onboarding-invitations/:id/resend", id, opts);
    await delay(300);
    const expires_at = at(3 * DAY);
    mockInvites = mockInvites.map((i) => (i.id === id ? { ...i, status: "pending", expires_at, email_status: "sent", email_sent_at: at(0), email_error: null } : i));
    return { expires_at, email_status: "sent" };
  },
  revokeInvite: async (id: string): Promise<void> => {
    console.log("[mock] DELETE /admin/platform/onboarding-invitations/:id", id);
    await delay(300);
    mockInvites = mockInvites.map((i) => (i.id === id ? { ...i, status: "revoked" } : i));
  },
  deleteInvite: async (id: string): Promise<void> => {
    console.log("[mock] DELETE /admin/platform/onboarding-invitations/:id/permanent", id);
    await delay(300);
    mockInvites = mockInvites.filter((i) => i.id !== id);
  },
};
