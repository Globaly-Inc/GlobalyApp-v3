import type { AdminUser } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const mockMe: AdminUser = {
  id: 1,
  uuid: "mock-admin-uuid",
  name: "Super Admin",
  email: "admin@example.com",
  role: "super_admin",
  photo_url: null,
  account_status: 1,
  is_email_verified: true,
};

export const adminMockApi = {
  getMe: async (): Promise<AdminUser> => {
    console.log("[mock] GET /admin/me");
    await delay(300);
    return mockMe;
  },

  updateMe: async (id: number, patch: Partial<Pick<AdminUser, "name">>): Promise<AdminUser> => {
    console.log("[mock] PATCH /admin/users/" + id, patch);
    await delay(300);
    Object.assign(mockMe, patch);
    return mockMe;
  },
};
