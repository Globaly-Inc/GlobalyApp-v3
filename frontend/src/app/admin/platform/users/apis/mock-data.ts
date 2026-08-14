import { mockMe } from "../../../apis/mock-data";
import type { AdminUser, InviteAdminParams, ListAdminsParams, PaginatedAdmins } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let mockAdmins: AdminUser[] = [mockMe];

export const usersMockApi = {
  listAdmins: async (params: ListAdminsParams = {}): Promise<PaginatedAdmins> => {
    console.log("[mock] GET /admin/users", params);
    await delay(300);
    return { data: mockAdmins, meta: { page: 1, limit: 20, total: mockAdmins.length, totalPages: 1 } };
  },

  inviteAdmin: async (params: InviteAdminParams): Promise<void> => {
    console.log("[mock] POST /admin/users/invite", params);
    await delay(300);
    mockAdmins = [
      ...mockAdmins,
      {
        id: mockAdmins.length + 1,
        uuid: crypto.randomUUID(),
        name: `${params.first_name} ${params.last_name}`,
        email: params.email,
        role: params.role,
        photo_url: null,
        account_status: 0,
        is_email_verified: false,
      },
    ];
  },

  updateAdmin: async (
    id: number,
    patch: Partial<Pick<AdminUser, "name" | "role" | "account_status" | "photo_url">>,
  ): Promise<AdminUser> => {
    console.log("[mock] PATCH /admin/users/" + id, patch);
    await delay(300);
    const updated = { ...mockAdmins.find((a) => a.id === id), ...patch } as AdminUser;
    mockAdmins = mockAdmins.map((a) => (a.id === id ? updated : a));
    return updated;
  },
};
