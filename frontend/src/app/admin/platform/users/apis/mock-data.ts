import { uuid } from "@/lib/utils";
import type { AdminInvitation, InviteAdminParams, ListParams, PaginatedInvitations } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let mockInvitations: AdminInvitation[] = [
  {
    id: uuid(), email: "new.admin@example.com", first_name: "Jordan", last_name: "Lee",
    role: "admin", status: "pending", invited_by: 1,
    created_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    expired_at: new Date(Date.now() + 1 * 86_400_000).toISOString(),
  },
  {
    id: uuid(), email: "data.reviewer@example.com", first_name: "Casey", last_name: "Nguyen",
    role: "data_admin", status: "pending", invited_by: 1,
    created_at: new Date(Date.now() - 5 * 86_400_000).toISOString(),
    expired_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  },
  {
    id: uuid(), email: "moderator@example.com", first_name: "Riley", last_name: "Kim",
    role: "moderator", status: "accepted", invited_by: 1,
    created_at: new Date(Date.now() - 10 * 86_400_000).toISOString(),
    expired_at: new Date(Date.now() - 7 * 86_400_000).toISOString(),
  },
];

function matches(search: string | undefined, ...fields: string[]): boolean {
  if (!search) return true;
  const q = search.toLowerCase();
  return fields.some((f) => f.toLowerCase().includes(q));
}

function paginate<T>(rows: T[], params: ListParams): { data: T[]; meta: PaginatedInvitations["meta"] } {
  const limit = params.limit ?? 10;
  const page = params.page ?? 1;
  const start = (page - 1) * limit;
  return {
    data: rows.slice(start, start + limit),
    meta: { page, limit, total: rows.length, totalPages: Math.max(1, Math.ceil(rows.length / limit)) },
  };
}

export const usersMockApi = {
  listInvitations: async (params: ListParams = {}): Promise<PaginatedInvitations> => {
    console.log("[mock] GET /admin/users/invitations", params);
    await delay(300);
    const filtered = mockInvitations
      .filter((i) => i.status === "pending")
      .filter((i) => matches(params.search, i.first_name, i.last_name, i.email));
    return paginate(filtered, params);
  },

  resendInvitation: async (id: string): Promise<void> => {
    console.log("[mock] POST /admin/users/invitations/:id/resend", id);
    await delay(300);
    const invitation = mockInvitations.find((i) => i.id === id);
    if (!invitation) throw new Error("Invitation not found");
    invitation.expired_at = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
  },

  inviteAdmin: async (params: InviteAdminParams): Promise<void> => {
    console.log("[mock] POST /admin/users/invite", params);
    await delay(300);
    mockInvitations = [
      {
        id: uuid(), email: params.email, first_name: params.first_name, last_name: params.last_name,
        role: params.role, status: "pending", invited_by: 1,
        created_at: new Date().toISOString(),
        expired_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
      },
      ...mockInvitations,
    ];
  },
};
